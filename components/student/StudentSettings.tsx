'use client';

import React, { useState } from 'react';
import {
  Bell,
  Cloud,
  DatabaseBackup,
  Eye,
  Lock,
  Monitor,
  Palette,
  Plug,
  Save,
  Settings2,
  Shield,
  Video,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

type ToggleKey =
  | 'autoPlay'
  | 'speedControl'
  | 'downloadBlock'
  | 'watermark'
  | 'tabPause'
  | 'attentionCheck'
  | 'deviceLimit';

export function StudentSettings() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('video');
  const [securityMode, setSecurityMode] = useState<'standard' | 'internal' | 'high'>('internal');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    autoPlay: true,
    speedControl: false,
    downloadBlock: true,
    watermark: true,
    tabPause: true,
    attentionCheck: true,
    deviceLimit: true,
  });
  const [completionRatio, setCompletionRatio] = useState('90');
  const [savedToast, setSavedToast] = useState(false);

  const tabs = [
    { id: 'general', icon: Settings2, label: t('student.settings.tabGeneral') },
    { id: 'display', icon: Palette, label: t('student.settings.tabDisplay') },
    { id: 'email', icon: Bell, label: t('student.settings.tabEmail') },
    { id: 'security', icon: Lock, label: t('student.settings.tabSecurity') },
    { id: 'video', icon: Video, label: t('student.settings.tabVideo') },
    { id: 'integration', icon: Plug, label: t('student.settings.tabIntegration') },
    { id: 'backup', icon: DatabaseBackup, label: t('student.settings.tabBackup') },
    { id: 'other', icon: Monitor, label: t('student.settings.tabOther') },
  ];

  const settingRows: Array<{ key: ToggleKey; title: string; desc: string; icon: typeof Video }> = [
    { key: 'autoPlay', title: t('student.settings.autoPlay'), desc: t('student.settings.autoPlayDesc'), icon: Video },
    { key: 'speedControl', title: t('student.settings.speedControl'), desc: t('student.settings.speedControlDesc'), icon: Monitor },
    { key: 'downloadBlock', title: t('student.settings.downloadBlock'), desc: t('student.settings.downloadBlockDesc'), icon: Shield },
    { key: 'watermark', title: t('student.settings.watermark'), desc: t('student.settings.watermarkDesc'), icon: Eye },
    { key: 'tabPause', title: t('student.settings.tabPause'), desc: t('student.settings.tabPauseDesc'), icon: Lock },
    { key: 'attentionCheck', title: t('student.settings.attentionCheck'), desc: t('student.settings.attentionCheckDesc'), icon: Shield },
    { key: 'deviceLimit', title: t('student.settings.deviceLimit'), desc: t('student.settings.deviceLimitDesc'), icon: Cloud },
  ];

  const modes = [
    { id: 'standard' as const, title: t('student.settings.modeStandard'), desc: t('student.settings.modeStandardDesc') },
    { id: 'internal' as const, title: t('student.settings.modeInternal'), desc: t('student.settings.modeInternalDesc'), recommended: true },
    { id: 'high' as const, title: t('student.settings.modeHigh'), desc: t('student.settings.modeHighDesc') },
  ];

  const toggle = (key: ToggleKey) => setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  const save = () => {
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 1800);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[24px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navSettings')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.settings.subtitle')}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#e7edf5] bg-white p-2 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex min-w-[110px] flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-[11px] font-bold transition ${
              activeTab === tab.id
                ? 'bg-[#eff8f0] text-[#18701C] shadow-sm ring-1 ring-[#cfe0d4]'
                : 'text-[#63708a] hover:bg-[#f5f8fc]'
            }`}
          >
            <tab.icon size={18} />
            <span className="text-center leading-tight">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_340px]">
        <section className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)] sm:p-5">
          <h2 className="m-0 mb-1 text-[18px] font-bold text-[#18701C]">{t('student.settings.tabVideo')}</h2>
          <p className="mb-4 text-[13px] text-[#63708a]">{t('student.settings.videoHint')}</p>

          <div className="mb-5 rounded-xl border border-[#e8f0e9] bg-[#f7fbf8] p-3.5">
            <label className="mb-1.5 block text-[12px] font-bold text-[#243552]">{t('student.settings.completionThreshold')}</label>
            <select
              value={completionRatio}
              onChange={e => setCompletionRatio(e.target.value)}
              className="w-full rounded-xl border border-[#d7e5db] bg-white px-3 py-2.5 text-[14px] font-semibold text-[#111b38] outline-none focus:border-[#18701C]"
            >
              <option value="80">80%</option>
              <option value="90">90%</option>
              <option value="95">95%</option>
              <option value="100">100%</option>
            </select>
          </div>

          <div className="space-y-2.5">
            {settingRows.map((row, index) => (
              <div
                key={row.key}
                className="flex items-start gap-3 rounded-xl border border-[#eef2f7] bg-[#fbfcfe] px-3.5 py-3.5 transition hover:border-[#cfe0d4] hover:bg-[#f4faf6]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#18701C] text-[15px] font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] font-bold text-[#111b38]">{row.title}</p>
                  <p className="m-0 mt-0.5 text-[12px] text-[#63708a]">{row.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${toggles[row.key] ? 'bg-[#18701C]' : 'bg-[#c9d3df]'}`}
                  aria-pressed={toggles[row.key]}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${toggles[row.key] ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <b className="text-[14px] text-[#111b38]">{t('student.settings.previewTitle')}</b>
              <button
                type="button"
                onClick={save}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#18701C] px-3.5 py-2 text-[12px] font-bold text-white shadow-[0_6px_14px_rgba(24,112,28,0.25)] hover:bg-[#145616]"
              >
                <Save size={14} />
                {t('student.settings.save')}
              </button>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-[#0f3d18]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#145616] to-[#0a2f12]" />
              <div className="absolute inset-0 grid place-items-center text-white/80">
                <Video size={36} />
              </div>
              {toggles.watermark && (
                <span className="absolute right-3 top-3 rounded bg-black/35 px-2 py-1 text-[10px] font-bold text-white/90">
                  BioKama • learner@biokama.vn
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <b className="mb-3 block text-[14px] text-[#111b38]">{t('student.settings.securityModes')}</b>
            <div className="space-y-2">
              {modes.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSecurityMode(mode.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    securityMode === mode.id
                      ? 'border-[#18701C] bg-[#eff8f0] shadow-sm'
                      : 'border-[#e7edf5] bg-white hover:border-[#cfe0d4]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-bold text-[#111b38]">{mode.title}</span>
                    {'recommended' in mode && mode.recommended && (
                      <span className="rounded-full bg-[#18701C] px-2 py-0.5 text-[10px] font-bold text-white">
                        {t('student.settings.recommended')}
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-1 text-[12px] text-[#63708a]">{mode.desc}</p>
                  <span className={`mt-2 inline-block h-4 w-4 rounded-full border-2 ${securityMode === mode.id ? 'border-[#18701C] bg-[#18701C]' : 'border-[#c9d3df]'}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 rounded-2xl border border-[#c6ebd4] bg-[#edfbf4] p-3.5 text-[12px] text-[#2f6b3d]">
            <Shield className="shrink-0 text-[#18701C]" size={18} />
            <p className="m-0 leading-relaxed">{t('student.settings.hintBox')}</p>
          </div>
        </aside>
      </div>

      {savedToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-[#18701C] px-4 py-2.5 text-[13px] font-bold text-white shadow-lg">
          {t('student.settings.saved')}
        </div>
      )}
    </div>
  );
}
