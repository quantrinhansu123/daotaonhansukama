'use client';

import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserProfile, Position } from '@/types/user';
import { User, Mail, Phone, MapPin, Globe, Briefcase, Calendar, Building2, DollarSign, Save, Edit2, X } from 'lucide-react';

export const StaffProfile: React.FC = () => {
  const { userProfile: user } = useAuth();
  const { t, dateLocale } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [departmentName, setDepartmentName] = useState<string>('');
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

  const handleSave = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        ...formData,
        updatedAt: new Date(),
      });
      alert(t('staff.updateInfoSuccess'));
      setEditing(false);
      window.location.reload();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(t('staff.updateInfoError'));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#311898] flex items-center justify-center">
        <div className="text-white">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#311898]">
      <div className="max-w-4xl mx-auto p-4 md:p-8 pt-6">

        {/* Profile Card */}
        <div className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden">
          {/* Avatar Section */}
          <div className="bg-gradient-to-r from-[#53cafd]/20 to-blue-600/20 p-8 text-center border-b border-white/10">
            <div className="relative inline-block mb-4">
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&size=160&background=random`}
                alt={user.displayName}
                className="w-32 h-32 rounded-full object-cover border-4 border-white/20 shadow-xl"
              />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">{user.displayName}</h2>
            <p className="text-slate-300">{user.email}</p>
            <div className="flex justify-center gap-2 mt-4">
              <span className="px-4 py-1 bg-white/10 rounded-full text-white text-sm font-medium border border-white/10">
                {user.role === 'admin' ? t('staff.roleAdmin') : user.role === 'staff' ? t('staff.roleStaff') : user.role === 'teacher' ? t('staff.roleTeacher') : t('staff.roleStudent')}
              </span>
              {user.position && (
                <span className="px-4 py-1 bg-[#53cafd]/20 rounded-full text-[#53cafd] text-sm font-medium border border-[#53cafd]/30">
                  {user.position}
                </span>
              )}
            </div>
          </div>

          {/* Info Section */}
          <div className="p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{t("staff.detailInfo")}</h3>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#53cafd] text-white rounded-xl hover:bg-[#3db9f5] transition-colors shadow-lg shadow-[#53cafd]/25"
                >
                  <Edit2 size={18} />
                  {t("staff.edit")}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setFormData({
                        displayName: user.displayName,
                        dateOfBirth: user.dateOfBirth || '',
                        address: user.address || '',
                        country: user.country || '',
                        phoneNumber: user.phoneNumber || '',
                        workLocation: user.workLocation || '',
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors border border-white/10"
                  >
                    <X size={18} />
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors disabled:opacity-50 shadow-lg shadow-green-500/25"
                  >
                    <Save size={18} />
                    {loading ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Họ và tên */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <User className="text-[#53cafd]" size={20} />
                  <label className="text-slate-400 text-sm">{t("profile.fullName")}</label>
                </div>
                {editing ? (
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full bg-white/10 text-white px-4 py-2 rounded-lg border border-white/20 focus:border-[#53cafd] focus:outline-none focus:ring-1 focus:ring-[#53cafd]"
                  />
                ) : (
                  <p className="text-white font-medium">{user.displayName}</p>
                )}
              </div>

              {/* Email */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <Mail className="text-[#53cafd]" size={20} />
                  <label className="text-slate-400 text-sm">{t('profile.email')}</label>
                </div>
                <p className="text-white font-medium">{user.email}</p>
                <p className="text-slate-500 text-xs mt-1">{t("staff.emailImmutable")}</p>
              </div>

              {/* Số điện thoại */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <Phone className="text-[#53cafd]" size={20} />
                  <label className="text-slate-400 text-sm">{t("profile.phone")}</label>
                </div>
                {editing ? (
                  <input
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder={t("staff.phonePlaceholder")}
                    className="w-full bg-white/10 text-white px-4 py-2 rounded-lg border border-white/20 focus:border-[#53cafd] focus:outline-none focus:ring-1 focus:ring-[#53cafd]"
                  />
                ) : (
                  <p className="text-white font-medium">{user.phoneNumber || t('staff.notUpdated')}</p>
                )}
              </div>

              {/* Ngày sinh */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="text-[#53cafd]" size={20} />
                  <label className="text-slate-400 text-sm">{t("profile.dateOfBirth")}</label>
                </div>
                {editing ? (
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full bg-white/10 text-white px-4 py-2 rounded-lg border border-white/20 focus:border-[#53cafd] focus:outline-none focus:ring-1 focus:ring-[#53cafd]"
                  />
                ) : (
                  <p className="text-white font-medium">
                    {user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString(dateLocale) : t('staff.notUpdated')}
                  </p>
                )}
              </div>

              {/* Địa chỉ */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <MapPin className="text-[#53cafd]" size={20} />
                  <label className="text-slate-400 text-sm">{t("profile.address")}</label>
                </div>
                {editing ? (
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder={t("staff.addressPlaceholder")}
                    className="w-full bg-white/10 text-white px-4 py-2 rounded-lg border border-white/20 focus:border-[#53cafd] focus:outline-none focus:ring-1 focus:ring-[#53cafd]"
                  />
                ) : (
                  <p className="text-white font-medium">{user.address || t('staff.notUpdated')}</p>
                )}
              </div>

              {/* Quốc gia */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <Globe className="text-[#53cafd]" size={20} />
                  <label className="text-slate-400 text-sm">{t("profile.country")}</label>
                </div>
                {editing ? (
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder={t("staff.countryPlaceholder")}
                    className="w-full bg-white/10 text-white px-4 py-2 rounded-lg border border-white/20 focus:border-[#53cafd] focus:outline-none focus:ring-1 focus:ring-[#53cafd]"
                  />
                ) : (
                  <p className="text-white font-medium">{user.country || t('staff.notUpdated')}</p>
                )}
              </div>

              {/* Vị trí làm việc */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <Briefcase className="text-[#53cafd]" size={20} />
                  <label className="text-slate-400 text-sm">{t("profile.workLocation")}</label>
                </div>
                {editing ? (
                  <input
                    type="text"
                    value={formData.workLocation}
                    onChange={(e) => setFormData({ ...formData, workLocation: e.target.value })}
                    placeholder={t("staff.workLocationPlaceholder")}
                    className="w-full bg-white/10 text-white px-4 py-2 rounded-lg border border-white/20 focus:border-[#53cafd] focus:outline-none focus:ring-1 focus:ring-[#53cafd]"
                  />
                ) : (
                  <p className="text-white font-medium">{user.workLocation || t('staff.notUpdated')}</p>
                )}
              </div>

              {/* Phòng ban */}
              {departmentName && (
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <Building2 className="text-[#53cafd]" size={20} />
                    <label className="text-slate-400 text-sm">{t("profile.department")}</label>
                  </div>
                  <p className="text-white font-medium">{departmentName}</p>
                  <p className="text-slate-500 text-xs mt-1">{t("staff.contactAdminToChange")}</p>
                </div>
              )}

              {/* Lương cơ bản */}
              {user.monthlySalary && (
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <DollarSign className="text-[#53cafd]" size={20} />
                    <label className="text-slate-400 text-sm">{t("staff.baseSalary")}</label>
                  </div>
                  <p className="text-white font-medium">{user.monthlySalary.toLocaleString(dateLocale)} {t('staff.currencyVnd')}</p>
                  <p className="text-slate-500 text-xs mt-1">{t("staff.contactAdminToChange")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
