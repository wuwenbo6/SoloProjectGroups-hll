import React from 'react';
import { Link } from 'react-router-dom';
import { Download, User, Package } from 'lucide-react';
import type { Plugin } from '../types';
import { RatingStars } from './RatingStars';

interface PluginCardProps {
  plugin: Plugin;
  className?: string;
}

export const PluginCard: React.FC<PluginCardProps> = ({ plugin, className = '' }) => {
  const latestVersion = plugin.versions?.[0];

  return (
    <Link
      to={`/plugin/${plugin.id}`}
      className={`group relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5 
        hover:border-teal-500/50 hover:bg-slate-800/80 transition-all duration-300 
        hover:-translate-y-1 hover:shadow-lg hover:shadow-teal-500/10 ${className}`}
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-teal-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="relative">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-14 h-14 bg-slate-700 rounded-lg flex items-center justify-center overflow-hidden border border-slate-600">
            {plugin.icon ? (
              <img 
                src={plugin.icon} 
                alt={plugin.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <Package className="w-7 h-7 text-teal-400 hidden" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-mono text-lg font-semibold text-white truncate group-hover:text-teal-400 transition-colors">
              {plugin.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded">
                v{latestVersion?.version || 'N/A'}
              </span>
              {plugin.category && (
                <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                  {plugin.category.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-400 line-clamp-2 mb-4 leading-relaxed">
          {plugin.description}
        </p>

        <div className="flex items-center justify-between">
          <RatingStars 
            rating={plugin.averageRating} 
            size={14} 
            showValue 
            count={plugin.ratingCount}
          />
          
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="truncate max-w-[80px]">{plugin.author}</span>
            </div>
            <div className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              <span>{plugin.downloads.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {plugin.experimental && (
          <div className="absolute top-3 right-3">
            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
              实验性
            </span>
          </div>
        )}
        
        {plugin.deprecated && (
          <div className="absolute top-3 right-3">
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
              已弃用
            </span>
          </div>
        )}
      </div>
    </Link>
  );
};
