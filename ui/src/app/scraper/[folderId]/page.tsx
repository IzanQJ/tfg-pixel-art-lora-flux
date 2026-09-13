import ScraperFolderView from '@/components/scraper/ScraperFolderView';

interface Props {
  params: Promise<{
    folderId: string;
  }>;
}

export default async function ScraperFolderPage({ params }: Props) {
  const { folderId } = await params;
  return <ScraperFolderView folderId={decodeURIComponent(folderId)} />;
}
