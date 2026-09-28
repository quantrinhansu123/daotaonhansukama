'use client';

import React from 'react';
import { Facebook, Twitter, Instagram, Linkedin, Mail, Phone, MapPin } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export const Footer: React.FC = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-[#0E3A16]/80 backdrop-blur-md text-slate-300 py-16 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white">
              <div className="h-9 px-2.5 py-1 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <img src="/logo.png" alt="BioKama" className="h-8 w-auto object-contain" />
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {t('landing.footer.description')}
            </p>
            <div className="flex gap-4 pt-2">
              <a href="#" className="hover:text-white transition-colors"><Facebook size={20} /></a>
              <a href="#" className="hover:text-white transition-colors"><Twitter size={20} /></a>
              <a href="#" className="hover:text-white transition-colors"><Instagram size={20} /></a>
              <a href="#" className="hover:text-white transition-colors"><Linkedin size={20} /></a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-bold mb-4">{t('landing.footer.explore')}</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.about')}</a></li>
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.courses')}</a></li>
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.roadmap')}</a></li>
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.news')}</a></li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-bold mb-4">{t('landing.footer.support')}</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.guide')}</a></li>
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.faq')}</a></li>
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.policy')}</a></li>
              <li><a href="#" className="hover:text-brand-400 transition-colors">{t('landing.footer.contactIT')}</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-bold mb-4">{t('landing.footer.contact')}</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <MapPin size={18} className="flex-shrink-0 text-brand-500" />
                <span>{t('landing.footer.address')}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={18} className="flex-shrink-0 text-brand-500" />
                <span>Ext: 1234</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={18} className="flex-shrink-0 text-brand-500" />
                <span>training@company.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8 text-center text-sm text-slate-500">
          {t('landing.footer.copyright')}
        </div>
      </div>
    </footer>
  );
};
