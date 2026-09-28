'use client';

import React, { useState, useEffect } from 'react';
import { doc, setDoc, collection, getDocs, query, where } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserProfile } from '@/types/user';
import { User, Mail, Phone, MapPin, Globe, Briefcase, Calendar, Building2, DollarSign, Save, X, Camera, Upload, Languages } from 'lucide-react';
import { Locale } from '@/lib/i18n/types';
import { proxyBunnyUrl } from '@/lib/bunny-media';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { userProfile: user } = useAuth();
  const { t, dateLocale, locale, setLocale } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [departmentName, setDepartmentName] = useState<string>('');
  const [photoURL, setPhotoURL] = useState<string>('');
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    displayName: '',
    dateOfBirth: '',
    address: '',
    country: '',
    phoneNumber: '',
    workLocation: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.displayName,
        dateOfBirth: user.dateOfBirth || '',
        address: user.address || '',
        country: user.country || '',
        phoneNumber: user.phoneNumber || '',
        workLocation: user.workLocation || '',
      });
      setPhotoURL(user.photoURL || '');
      loadDepartmentName();
    }
  }, [user]);

  const loadDepartmentName = async () => {
    if (!user?.departmentId) return;
    try {
      const deptQuery = query(collection(db, 'departments'), where('id', '==', user.departmentId));
      const deptSnapshot = await getDocs(deptQuery);
      if (!deptSnapshot.empty) {
        setDepartmentName(deptSnapshot.docs[0].data().name);
      }
    } catch (error) {
      console.error('Error loading department:', error);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert(t('profile.selectImage'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(t('profile.imageTooLarge'));
      return;
    }

    try {
      setUploading(true);

      // Create unique filename
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const filePath = `avatars/${user.uid}/${fileName}`;

      // Upload to Bunny Storage via API route
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', filePath);

      const response = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload photo');
      }

      const data = await response.json();
      setPhotoURL(data.url);
      alert(t('profile.uploadPhotoSuccess'));
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert(t('profile.uploadPhotoError'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const userRef = doc(db, 'users', user.uid);
      
      // Sử dụng setDoc với merge để tạo document nếu chưa có hoặc update nếu đã có
      await setDoc(userRef, {
        ...formData,
        photoURL: photoURL || null,
        updatedAt: new Date(),
      }, { merge: true });
      
      // Cập nhật localStorage
      const updatedUser = {
        ...user,
        ...formData,
        photoURL: photoURL || null,
        updatedAt: new Date(),
      };
      if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED !== 'true' && process.env.NEXT_PUBLIC_SUPABASE_ENABLED !== 'true') {
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      }
      
      alert(t('profile.updateSuccess'));
      onClose();
      window.location.reload();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(t('profile.updateError'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-brand-600 to-brand-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{t('profile.titleAlt')}</h2>
            <p className="text-white/80 text-sm mt-1">{t('profile.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative group">
              {photoURL ? (
                <img 
                  src={proxyBunnyUrl(photoURL)}
                  alt={user.displayName} 
                  className="w-32 h-32 rounded-full object-cover border-4 border-brand-500 shadow-xl"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-4xl font-bold border-4 border-brand-500 shadow-xl">
                  {user.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="text-white text-center">
                  {uploading ? (
                    <div className="animate-spin">
                      <Upload size={24} />
                    </div>
                  ) : (
                    <>
                      <Camera size={24} className="mx-auto mb-1" />
                      <span className="text-xs">{t('profile.changePhoto')}</span>
                    </>
                  )}
                </div>
              </label>
            </div>
            <p className="text-sm text-slate-500 mt-2">{t('profile.clickToChangePhoto')}</p>
          </div>

          <div className="space-y-4">
            {/* Họ và tên */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <User size={16} className="text-brand-600" />
                {t('profile.fullName')}
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                placeholder={t('profile.fullNamePlaceholder')}
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Mail size={16} className="text-brand-600" />
                {t('profile.email')}
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 mt-1">{t('profile.emailReadonly')}</p>
            </div>

            {/* Số điện thoại */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Phone size={16} className="text-brand-600" />
                {t('profile.phone')}
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                placeholder={t('profile.phonePlaceholder')}
              />
            </div>

            {/* Ngày sinh */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Calendar size={16} className="text-brand-600" />
                {t('profile.dateOfBirth')}
              </label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>

            {/* Địa chỉ */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <MapPin size={16} className="text-brand-600" />
                {t('profile.address')}
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                placeholder={t('profile.addressPlaceholder')}
              />
            </div>

            {/* Quốc gia */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Globe size={16} className="text-brand-600" />
                {t('profile.country')}
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                placeholder={t('profile.countryPlaceholder')}
              />
            </div>

            {/* Vị trí làm việc */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Briefcase size={16} className="text-brand-600" />
                {t('profile.workLocation')}
              </label>
              <input
                type="text"
                value={formData.workLocation}
                onChange={(e) => setFormData({ ...formData, workLocation: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                placeholder={t('profile.workLocationPlaceholder')}
              />
            </div>

            {/* Phòng ban (read-only) */}
            {departmentName && (
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                  <Building2 size={16} className="text-brand-600" />
                  {t('profile.department')}
                </label>
                <input
                  type="text"
                  value={departmentName}
                  disabled
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 mt-1">{t('profile.contactAdmin')}</p>
              </div>
            )}

            {/* Lương cơ bản (read-only) */}
            {user.monthlySalary && (
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                  <DollarSign size={16} className="text-brand-600" />
                  {t('profile.baseSalary')}
                </label>
                <input
                  type="text"
                  value={`${user.monthlySalary.toLocaleString(dateLocale)} VNĐ`}
                  disabled
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 mt-1">{t('profile.contactAdmin')}</p>
              </div>
            )}

            {/* Ngôn ngữ */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Languages size={16} className="text-brand-600" />
                {t('profile.language')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLocale('vi' as Locale)}
                  className={`px-4 py-2.5 rounded-xl border-2 font-medium transition-all ${
                    locale === 'vi'
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t('profile.languageVi')}
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('en' as Locale)}
                  className={`px-4 py-2.5 rounded-xl border-2 font-medium transition-all ${
                    locale === 'en'
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t('profile.languageEn')}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t('profile.languageHint')}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
            <button
              onClick={handleSave}
              disabled={loading || uploading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl hover:from-brand-700 hover:to-brand-800 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              <Save size={18} />
              {loading ? t('common.saving') : t('profile.save')}
            </button>
            <button
              onClick={onClose}
              disabled={loading || uploading}
              className="px-6 py-3 border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('profile.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
