'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePipeline } from './PipelineContext';
import { Send, Loader2, ImageIcon } from 'lucide-react';
import { formatGenerationModelLabel } from '@/utils/trainingCatalog';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  seed?: number;
  saved?: boolean;
}

export default function GenerateChat() {
  const { selectedModel } = usePipeline();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleGenerate = async () => {
    const prompt = input.trim();
    if (!prompt || generating) return;

    const userMsg: ChatMessage = { id: ++idRef.current, role: 'user', content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setGenerating(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: selectedModel }),
      });
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: ++idRef.current,
        role: 'assistant',
        content: data.success
          ? `Imagen generada con ${formatGenerationModelLabel(selectedModel)} (seed: ${data.seed})`
          : `Error: ${data.error}`,
        imageUrl: data.success ? data.imageUrl : undefined,
        seed: data.seed,
        saved: data.saved,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { id: ++idRef.current, role: 'assistant', content: `Error de conexión: ${err.message}` },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-100">Generador de Pixel Art</h1>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Modelo: <span className="text-yellow-400 font-medium">{formatGenerationModelLabel(selectedModel)}</span>
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <ImageIcon className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">Escribe un prompt para generar pixel art</p>
            <p className="text-sm mt-1">Ejemplo: &quot;dragon sprite, fire breathing, retro game style&quot;</p>
            <p className="text-xs mt-2 text-gray-600">Se añade automáticamente &quot;pixelart,&quot; si falta</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user' ? 'bg-yellow-600/20 text-gray-100 border border-yellow-700/30' : 'bg-gray-800 text-gray-200'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.imageUrl && (
                <img
                  src={msg.imageUrl}
                  alt="Generated pixel art"
                  className="mt-3 rounded-lg max-w-full border border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ imageRendering: 'pixelated', maxHeight: 512 }}
                  onClick={() => window.open(msg.imageUrl, '_blank')}
                />
              )}
            </div>
          </div>
        ))}

        {generating && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Generando imagen…</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 px-6 py-4">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un prompt… (Enter para enviar)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-600/50 focus:border-transparent"
            rows={2}
            disabled={generating}
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !input.trim()}
            className="self-end px-4 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl transition-colors flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
