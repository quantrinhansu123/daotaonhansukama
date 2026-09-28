'use client';

import React from 'react';
import { Brain, Globe, Video, Award, Users, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export const Features: React.FC = () => {
  const { t } = useLanguage();

  const features = [
    {
      icon: <Brain className="w-6 h-6 text-white" />,
      title: t('landing.features.items.practical.title'),
      description: t('landing.features.items.practical.description'),
      color: "bg-purple-500"
    },
    {
      icon: <Video className="w-6 h-6 text-white" />,
      title: t('landing.features.items.video.title'),
      description: t('landing.features.items.video.description'),
      color: "bg-blue-500"
    },
    {
      icon: <Globe className="w-6 h-6 text-white" />,
      title: t('landing.features.items.anytime.title'),
      description: t('landing.features.items.anytime.description'),
      color: "bg-green-500"
    },
    {
      icon: <Users className="w-6 h-6 text-white" />,
      title: t('landing.features.items.department.title'),
      description: t('landing.features.items.department.description'),
      color: "bg-orange-500"
    },
    {
      icon: <Award className="w-6 h-6 text-white" />,
      title: t('landing.features.items.progress.title'),
      description: t('landing.features.items.progress.description'),
      color: "bg-red-500"
    },
    {
      icon: <Zap className="w-6 h-6 text-white" />,
      title: t('landing.features.items.growth.title'),
      description: t('landing.features.items.growth.description'),
      color: "bg-yellow-500"
    }
  ];

  return (
    <section id="features" className="py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-base font-semibold text-[#1B7A1E] uppercase tracking-wide">{t('landing.features.eyebrow')}</h2>
          <p className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">
            {t('landing.features.title')}
          </p>
          <p className="mt-4 max-w-2xl text-xl text-slate-300 mx-auto">
            {t('landing.features.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="group relative bg-[#5e3ed0]/20 backdrop-blur-md p-8 rounded-2xl hover:bg-[#5e3ed0]/30 hover:shadow-xl transition-all duration-300 border border-white/10 hover:border-[#1B7A1E]/50">
              <div className={`inline-flex items-center justify-center p-3 rounded-xl shadow-lg mb-6 ${feature.color} transform group-hover:scale-110 transition-transform`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[#1B7A1E] transition-colors">
                {feature.title}
              </h3>
              <p className="text-slate-300 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
