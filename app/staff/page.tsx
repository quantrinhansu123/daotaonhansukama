'use client';

import { useState } from 'react';
import { StaffCheckIn } from '@/components/staff/StaffCheckIn';
import { StaffProfile } from '@/components/staff/StaffProfile';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Clock, User, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function StaffPage() {
  const [activeTab, setActiveTab] = useState<'checkin' | 'profile'>('checkin');
  const { signOut } = useAuth();
  const { t } = useLanguage();

  return (
    <ProtectedRoute allowedRoles={['staff']}>
      <div className="min-h-screen">
        {/* Navigation Bar */}
        <div className="bg-black/30 backdrop-blur-lg border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('checkin')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'checkin'
                      ? 'bg-brand-600 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                >
                  <Clock size={20} />
                  {t('staff.checkIn')}
                </button>
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'profile'
                      ? 'bg-brand-600 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                >
                  <User size={20} />
                  {t('staff.personalInfoTab')}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <LanguageSwitcher variant="light" />
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 px-4 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <LogOut size={20} />
                  {t('common.logout')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'checkin' ? <StaffCheckIn /> : <StaffProfile />}
      </div>
    </ProtectedRoute>
  );
}
