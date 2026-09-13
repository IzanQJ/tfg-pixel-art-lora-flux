import prisma from '../prisma';
import { Job } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { TOOLKIT_ROOT, getTrainingFolder, getHFToken } from '../paths';
const isWindows = process.platform === 'win32';

const startAndWatchJob = (job: Job) => {
  // starts and watches the job asynchronously
  return new Promise<void>(async (resolve, reject) => {
    const jobID = job.id;

    // setup the training
    const trainingRoot = await getTrainingFolder();

    const trainingFolder = path.join(trainingRoot, job.name);
    if (!fs.existsSync(trainingFolder)) {
      fs.mkdirSync(trainingFolder, { recursive: true });
    }

    // make the config file
    const configPath = path.join(trainingFolder, '.job_config.json');

    //log to path
    const logPath = path.join(trainingFolder, 'log.txt');

    try {
      // if the log path exists, move it to a folder called logs and rename it {num}_log.txt, looking for the highest num
      // if the log path does not exist, create it
      if (fs.existsSync(logPath)) {
        const logsFolder = path.join(trainingFolder, 'logs');
        if (!fs.existsSync(logsFolder)) {
          fs.mkdirSync(logsFolder, { recursive: true });
        }

        let num = 0;
        while (fs.existsSync(path.join(logsFolder, `${num}_log.txt`))) {
          num++;
        }

        fs.renameSync(logPath, path.join(logsFolder, `${num}_log.txt`));
      }
    } catch (e) {
      console.error('Error moving log file:', e);
    }

    // update the config dataset path
    const jobConfig = JSON.parse(job.job_config);
    jobConfig.config.process[0].sqlite_db_path = path.join(TOOLKIT_ROOT, 'aitk_db.db');

    // write the config file
    fs.writeFileSync(configPath, JSON.stringify(jobConfig, null, 2));

    let pythonPath = 'python';
    // use .venv or venv if it exists
    if (fs.existsSync(path.join(TOOLKIT_ROOT, '.venv'))) {
      if (isWindows) {
        pythonPath = path.join(TOOLKIT_ROOT, '.venv', 'Scripts', 'python.exe');
      } else {
        pythonPath = path.join(TOOLKIT_ROOT, '.venv', 'bin', 'python');
      }
    } else if (fs.existsSync(path.join(TOOLKIT_ROOT, 'venv'))) {
      if (isWindows) {
        pythonPath = path.join(TOOLKIT_ROOT, 'venv', 'Scripts', 'python.exe');
      } else {
        pythonPath = path.join(TOOLKIT_ROOT, 'venv', 'bin', 'python');
      }
    }

    // -----------------------------------------------------------------------
    // MODAL GPU branch — gpu_ids starts with "modal_" (e.g. "modal_A10G")
    // -----------------------------------------------------------------------
    const isModalGpu = typeof job.gpu_ids === 'string' && job.gpu_ids.startsWith('modal_');

    if (isModalGpu) {
      const gpuType = (job.gpu_ids as string).replace('modal_', '');

      // Write a Modal-specific config file with adjusted paths
      const modalConfigPath = path.join(trainingFolder, '.modal_config.json');
      const modalConfig = JSON.parse(job.job_config);

      // Convert dataset folder_path from absolute Windows → absolute Linux container
      const remoteRoot = '/root/ai-toolkit';
      for (const dataset of modalConfig.config?.process?.[0]?.datasets || []) {
        if (dataset.folder_path && path.isAbsolute(dataset.folder_path)) {
          const rel = path.relative(TOOLKIT_ROOT, dataset.folder_path).replace(/\\/g, '/');
          if (!rel.startsWith('..')) {
            dataset.folder_path = `${remoteRoot}/${rel}`;
          }
        }
      }
      // sqlite_db_path is overridden inside run_modal.py's train() function
      // training_folder is also overridden inside run_modal.py to use the Volume
      fs.writeFileSync(modalConfigPath, JSON.stringify(modalConfig, null, 2));

      const runModalPath = path.join(TOOLKIT_ROOT, 'run_modal.py');
      const modalArgs = ['-m', 'modal', 'run', runModalPath, '--config-file', modalConfigPath, '--gpu-type', gpuType];

      const logStream = fs.createWriteStream(logPath, { flags: 'a' });
      logStream.write(`[UI] Launching Modal training on GPU ${gpuType}...\n`);
      logStream.write(`[UI] Job: ${job.name}\n`);

      let subprocess: ReturnType<typeof spawn>;
      try {
        subprocess = spawn(pythonPath, modalArgs, {
          env: { ...process.env, IS_AI_TOOLKIT_UI: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
          cwd: TOOLKIT_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        logStream.end();
        console.error('Error launching Modal process:', error);
        await prisma.job.update({
          where: { id: jobID },
          data: { status: 'error', info: `Error launching Modal: ${error?.message || 'Unknown error'}` },
        });
        return;
      }

      subprocess.stdout?.pipe(logStream, { end: false });
      subprocess.stderr?.pipe(logStream, { end: false });

      subprocess.on('close', async (code) => {
        logStream.end(`\n[UI] Modal process exited with code ${code}\n`);
        await prisma.job.update({
          where: { id: jobID },
          data: {
            status: code === 0 ? 'completed' : 'error',
            info: code === 0 ? 'Modal training complete' : `Modal process exited with code ${code}`,
            stop: false,
          },
        });
      });

      try {
        fs.writeFileSync(path.join(trainingFolder, 'pid.txt'), String(subprocess.pid ?? ''), { flag: 'w' });
      } catch (e) {
        console.error('Error writing pid file:', e);
      }

      // Resolve immediately — the close handler above will update the DB when done
      resolve();
      return;
    }

    // -----------------------------------------------------------------------
    // LOCAL GPU branch (original logic)
    // -----------------------------------------------------------------------
    const runFilePath = path.join(TOOLKIT_ROOT, 'run.py');
    if (!fs.existsSync(runFilePath)) {
      console.error(`run.py not found at path: ${runFilePath}`);
      await prisma.job.update({
        where: { id: jobID },
        data: {
          status: 'error',
          info: `Error launching job: run.py not found`,
        },
      });
      return;
    }

    const additionalEnv: any = {
      AITK_JOB_ID: jobID,
      CUDA_DEVICE_ORDER: 'PCI_BUS_ID',
      CUDA_VISIBLE_DEVICES: `${job.gpu_ids}`,
      IS_AI_TOOLKIT_UI: '1',
    };

    // HF_TOKEN
    const hfToken = await getHFToken();
    if (hfToken && hfToken.trim() !== '') {
      additionalEnv.HF_TOKEN = hfToken;
    }

    // Add the --log argument to the command
    const args = [runFilePath, configPath, '--log', logPath];

    try {
      let subprocess;

      if (isWindows) {
        // Spawn Python directly on Windows so the process can survive parent exit
        subprocess = spawn(pythonPath, args, {
          env: {
            ...process.env,
            ...additionalEnv,
          },
          cwd: TOOLKIT_ROOT,
          detached: true,
          windowsHide: true,
          stdio: 'ignore', // don't tie stdio to parent
        });
      } else {
        // For non-Windows platforms, fully detach and ignore stdio so it survives daemon-like
        subprocess = spawn(pythonPath, args, {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            ...additionalEnv,
          },
          cwd: TOOLKIT_ROOT,
        });
      }

      // Important: let the child run independently of this Node process.
      if (subprocess.unref) {
        subprocess.unref();
      }

      // Optionally write a pid file for future management (stop/inspect) without keeping streams open
      try {
        fs.writeFileSync(path.join(trainingFolder, 'pid.txt'), String(subprocess.pid ?? ''), { flag: 'w' });
      } catch (e) {
        console.error('Error writing pid file:', e);
      }

      // (No stdout/stderr listeners — logging should go to --log handled by your Python)
      // (No monitoring loop — the whole point is to let it live past this worker)
    } catch (error: any) {
      // Handle any exceptions during process launch
      console.error('Error launching process:', error);

      await prisma.job.update({
        where: { id: jobID },
        data: {
          status: 'error',
          info: `Error launching job: ${error?.message || 'Unknown error'}`,
        },
      });
      return;
    }
    // Resolve the promise immediately after starting the process
    resolve();
  });
};

export default async function startJob(jobID: string) {
  const job: Job | null = await prisma.job.findUnique({
    where: { id: jobID },
  });
  if (!job) {
    console.error(`Job with ID ${jobID} not found`);
    return;
  }
  // update job status to 'running', this will run sync so we don't start multiple jobs.
  await prisma.job.update({
    where: { id: jobID },
    data: {
      status: 'running',
      stop: false,
      info: 'Starting job...',
    },
  });
  // start and watch the job asynchronously so the cron can continue
  startAndWatchJob(job);
}
