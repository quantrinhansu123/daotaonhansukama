'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserRole, UserProfile } from '@/types/user';
import { LanguageSwitcher } from './LanguageSwitcher';

interface AuthProps {
  initialMode?: 'login' | 'register';
  onBack?: () => void;
  showBackButton?: boolean;
}

export const Auth: React.FC<AuthProps> = ({ initialMode = 'login', onBack, showBackButton = false }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('Việt Nam');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = useAuth();
  const router = useRouter();

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  const redirectByRole = (userRole: UserRole) => {
    switch (userRole) {
      case 'admin':
      case 'staff':
        router.push('/admin');
        break;
      case 'teacher':
        router.push('/teacher');
        break;
      case 'student':
        router.push('/student');
        break;
      default:
        router.push('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const profile = await signIn(email, password);
        if (profile) {
          redirectByRole(profile.role);
        }
      } else {
        if (!displayName.trim()) {
          setError(t('auth.nameRequired'));
          setLoading(false);
          return;
        }

        const additionalInfo: Partial<UserProfile> = {};
        if (dateOfBirth) additionalInfo.dateOfBirth = dateOfBirth;
        if (address) additionalInfo.address = address;
        if (country) additionalInfo.country = country;
        if (phoneNumber) additionalInfo.phoneNumber = phoneNumber;
        if (workLocation) additionalInfo.workLocation = workLocation;

        const profile = await signUp(email, password, displayName, role, additionalInfo);

        if (profile.role === 'admin') {
          alert(t('auth.registerSuccessAdmin'));
          redirectByRole(profile.role);
        } else {
          alert(t('auth.registerSuccessPending'));
          setMode('login');
          setEmail('');
          setPassword('');
          setDisplayName('');
        }
      }
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fb8a05340.%E1%BA%A2nh.014538.jpg"
          alt="Background"
          className="w-full h-full object-cover opacity-30"
          style={{ minWidth: '100%', minHeight: '100%' }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/soldier-background.jpg';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/50"></div>
      </div>
      <div className="w-full max-w-5xl flex rounded-3xl overflow-hidden shadow-2xl bg-[#5e3ed0]/30 backdrop-blur-xl border border-white/10 relative z-10">
        <div className="hidden lg:flex lg:w-1/2 relative bg-[#311898]/50 text-white overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fb8a05340.%E1%BA%A2nh.014538.jpg"
              alt="Soldier Background"
              className="w-full h-full object-cover opacity-20 mix-blend-overlay scale-110 blur-sm"
              style={{ minWidth: '120%', minHeight: '120%', objectPosition: 'center' }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/soldier-background.jpg';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#311898] via-[#311898]/60 to-transparent backdrop-blur-sm"></div>
          </div>

          <div className="relative z-10 flex flex-col justify-between p-12 w-full">
            <div className="flex flex-col items-start gap-1 text-white cursor-pointer" onClick={onBack}>
              <span className="text-3xl font-bold text-yellow-400">{t('auth.brandLine1')}</span>
              <span className="text-2xl font-bold text-red-500">{t('auth.brandLine2')}</span>
            </div>

            <div className="space-y-6 max-w-md">
              <blockquote className="text-2xl font-medium leading-relaxed text-slate-100">
                {t('auth.quote')}
              </blockquote>
              <div className="flex items-center gap-4">
                <img
                  src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F1967b416.%E1%BA%A2nh.013339.jpg"
                  alt="User"
                  className="w-12 h-12 rounded-full border-2 border-white/20 object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/avvarta.jpg';
                  }}
                />
                <div>
                  <div className="font-bold text-white">{t('auth.quoteAuthor')}</div>
                  <div className="text-slate-300 text-sm whitespace-pre-line">
                    {t('auth.quoteAuthorSub')}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-slate-400">
              {t('auth.footer')}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative bg-white/5">
          <div className="absolute top-6 right-6 z-20">
            <LanguageSwitcher variant="light" />
          </div>

          {showBackButton && onBack && (
            <button
              onClick={onBack}
              className="absolute top-8 left-8 flex items-center text-slate-400 hover:text-white transition-colors lg:hidden"
            >
              <ArrowLeft size={20} className="mr-2" /> {t('common.back')}
            </button>
          )}

          <div className="w-full max-w-md space-y-8 animate-in slide-in-from-right-5 duration-500">
            <div className="text-center lg:text-left">
              <h2 className="text-3xl font-bold text-white tracking-tight">
                {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
              </h2>
              <p className="mt-2 text-slate-300">
                {mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {mode === 'register' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t('auth.fullName')}</label>
                    <input
                      type="text"
                      placeholder={t('auth.fullNamePlaceholder')}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white placeholder-slate-500 transition-all"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">{t('auth.dateOfBirth')}</label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white transition-all [color-scheme:dark]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">{t('auth.phone')}</label>
                      <input
                        type="tel"
                        placeholder="0912345678"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white placeholder-slate-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t('auth.address')}</label>
                    <input
                      type="text"
                      placeholder={t('auth.addressPlaceholder')}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white placeholder-slate-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">{t('auth.country')}</label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white transition-all [&>option]:bg-[#311898]"
                      >
                        <option value="Việt Nam">{t('auth.countries.vietnam')}</option>
                        <option value="Hoa Kỳ">{t('auth.countries.usa')}</option>
                        <option value="Nhật Bản">{t('auth.countries.japan')}</option>
                        <option value="Hàn Quốc">{t('auth.countries.korea')}</option>
                        <option value="Singapore">{t('auth.countries.singapore')}</option>
                        <option value="Khác">{t('auth.countries.other')}</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">{t('auth.workLocation')}</label>
                      <input
                        type="text"
                        placeholder={t('auth.workLocationPlaceholder')}
                        value={workLocation}
                        onChange={(e) => setWorkLocation(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white placeholder-slate-500 transition-all"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">{t('auth.email')}</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white placeholder-slate-500 transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-slate-300">{t('auth.password')}</label>
                  {mode === 'login' && (
                    <a href="#" className="text-sm font-medium text-[#53cafd] hover:text-[#3db9f5]">
                      {t('auth.forgotPassword')}
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] focus:bg-white/10 text-white placeholder-slate-500 transition-all pr-10"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full py-3.5 text-lg shadow-[#53cafd]/25" disabled={loading}>
                {loading
                  ? t('common.processing')
                  : mode === 'login'
                    ? t('auth.loginButton')
                    : t('auth.registerButton')}
              </Button>
            </form>

            <p className="text-center text-sm text-slate-400">
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
              <button onClick={toggleMode} className="font-bold text-[#53cafd] hover:text-[#3db9f5] hover:underline">
                {mode === 'login' ? t('auth.registerNow') : t('auth.loginNow')}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
