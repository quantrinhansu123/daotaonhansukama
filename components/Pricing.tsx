'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { Button } from './Button';
import { useLanguage } from '@/contexts/LanguageContext';

export const Pricing: React.FC = () => {
  const { t } = useLanguage();

  const plans = [
    {
      name: t('landing.pricing.basic.name'),
      price: t('landing.pricing.basic.price'),
      description: t('landing.pricing.basic.description'),
      features: [
        t('landing.pricing.basic.features.f1'),
        t('landing.pricing.basic.features.f2'),
        t('landing.pricing.basic.features.f3'),
        t('landing.pricing.basic.features.f4'),
      ],
      cta: t('landing.pricing.basic.cta'),
      variant: "secondary" as const
    },
    {
      name: t('landing.pricing.pro.name'),
      price: t('landing.pricing.pro.price'),
      period: t('landing.pricing.pro.period'),
      description: t('landing.pricing.pro.description'),
      features: [
        t('landing.pricing.pro.features.f1'),
        t('landing.pricing.pro.features.f2'),
        t('landing.pricing.pro.features.f3'),
        t('landing.pricing.pro.features.f4'),
        t('landing.pricing.pro.features.f5'),
      ],
      cta: t('landing.pricing.pro.cta'),
      variant: "primary" as const,
      popular: true
    },
    {
      name: t('landing.pricing.enterprise.name'),
      price: t('landing.pricing.enterprise.price'),
      description: t('landing.pricing.enterprise.description'),
      features: [
        t('landing.pricing.enterprise.features.f1'),
        t('landing.pricing.enterprise.features.f2'),
        t('landing.pricing.enterprise.features.f3'),
        t('landing.pricing.enterprise.features.f4'),
        t('landing.pricing.enterprise.features.f5'),
      ],
      cta: t('landing.pricing.enterprise.cta'),
      variant: "secondary" as const
    }
  ];

  return (
    <section id="pricing" className="py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-white">{t('landing.pricing.title')}</h2>
          <p className="mt-4 text-slate-300">{t('landing.pricing.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <div key={index} className={`relative flex flex-col p-8 rounded-3xl backdrop-blur-md border transition-all duration-300 ${plan.popular
                ? 'bg-[#5e3ed0]/40 text-white shadow-2xl scale-105 z-10 border-[#53cafd]/50'
                : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
              }`}>
              {plan.popular && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-[#53cafd] to-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wide shadow-lg">
                  {t('landing.pricing.mostPopular')}
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className={`mt-2 text-sm ${plan.popular ? 'text-slate-200' : 'text-slate-400'}`}>{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  {plan.period && <span className={`text-sm ${plan.popular ? 'text-slate-200' : 'text-slate-400'}`}>{plan.period}</span>}
                </div>
              </div>

              <ul className="flex-1 space-y-4 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 flex-shrink-0 ${plan.popular ? 'text-[#53cafd]' : 'text-[#53cafd]'}`} />
                    <span className="text-sm text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.variant}
                className={`w-full ${plan.popular ? 'bg-[#53cafd] hover:bg-[#3db9f5] text-white border-none shadow-lg shadow-[#53cafd]/30' : 'bg-white/10 hover:bg-white/20 text-white border-none'}`}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
