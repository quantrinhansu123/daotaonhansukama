'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, getDocs, doc, setDoc, query, where } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { UserProfile } from '@/types/user';
import { SalaryRecord } from '@/types/salary';
import { Search, DollarSign, Calendar, Save, X } from 'lucide-react';
import { Button } from '@/components/Button';

export const SalaryManagementNew: React.FC = () => {
  const { t, dateLocale } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'calculated' | 'not-calculated'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SalaryRecord | null>(null);
  const [formData, setFormData] = useState({
    userId: '',
    absentDays: 0,
    lateDays: 0,
    note: ''
  });

  function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load staff users
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const usersData = usersSnapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as UserProfile[];
      const staffUsers = usersData.filter(u => u.role === 'staff');
      setUsers(staffUsers);

      // Load salary records for selected month
      const salaryRef = collection(db, 'salaryRecords');
      const salaryQuery = query(salaryRef, where('month', '==', selectedMonth));
      const salarySnapshot = await getDocs(salaryQuery);
      const records = salarySnapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as SalaryRecord[];
      setSalaryRecords(records);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSalary = (baseSalary: number, absentDays: number, lateDays: number) => {
    const workingDays = 26;
    const dailySalary = baseSalary / workingDays;
    const absentDeduction = dailySalary * absentDays;
    const lateDeduction = (dailySalary / 2) * lateDays; // Đi muộn trừ 50% lương ngày
    const totalDeduction = absentDeduction + lateDeduction;
    const finalSalary = baseSalary - totalDeduction;

    return {
      deduction: totalDeduction,
      finalSalary: Math.max(0, finalSalary)
    };
  };

  const handleEdit = (user: UserProfile) => {
    const existingRecord = salaryRecords.find(r => r.userId === user.uid);

    if (existingRecord) {
      setEditingRecord(existingRecord);
      setFormData({
        userId: user.uid,
        absentDays: existingRecord.absentDays,
        lateDays: existingRecord.lateDays,
        note: existingRecord.note || ''
      });
    } else {
      setEditingRecord(null);
      setFormData({
        userId: user.uid,
        absentDays: 0,
        lateDays: 0,
        note: ''
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const user = users.find(u => u.uid === formData.userId);
      if (!user || !user.monthlySalary) {
        alert(t('admin.salary.noBaseSalary'));
        return;
      }

      const { deduction, finalSalary } = calculateSalary(
        user.monthlySalary,
        formData.absentDays,
        formData.lateDays
      );

      const recordId = `${formData.userId}_${selectedMonth}`;
      const recordData: any = {
        id: recordId,
        userId: user.uid,
        userName: user.displayName,
        month: selectedMonth,
        baseSalary: user.monthlySalary,
        workingDays: 26,
        absentDays: formData.absentDays,
        lateDays: formData.lateDays,
        deduction,
        finalSalary,
        createdAt: editingRecord?.createdAt || new Date(),
        updatedAt: new Date()
      };

      // Only add optional fields if they have values
      if (user.departmentId) {
        recordData.departmentId = user.departmentId;
      }
      if (formData.note) {
        recordData.note = formData.note;
      }

      await setDoc(doc(db, 'salaryRecords', recordId), recordData);
      alert(t('admin.salary.saveSuccess'));
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving salary:', error);
      alert(t('admin.salary.saveError'));
    }
  };

  const getSalaryRecord = (userId: string) => {
    return salaryRecords.find(r => r.userId === userId);
  };

  const filteredUsers = users.filter(user => {
    // Search filter
    const matchSearch = user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchSearch) return false;

    // Status filter
    const hasRecord = salaryRecords.some(r => r.userId === user.uid);
    if (filterStatus === 'calculated' && !hasRecord) return false;
    if (filterStatus === 'not-calculated' && hasRecord) return false;

    return true;
  });

  if (loading) {
    return <div className="p-8 text-center">{t('common.loading')}</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('admin.salary.title')}</h2>
          <p className="text-slate-300 mt-1">{t('admin.salary.subtitleCalc')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder={t('admin.salary.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white placeholder-slate-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white [&>option]:bg-[#0E3A16] [&>option]:text-white"
        >
          <option value="all">{t('common.all')}</option>
          <option value="calculated">{t('admin.salary.calculated')}</option>
          <option value="not-calculated">{t('admin.salary.notCalculated')}</option>
        </select>
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-slate-400" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">{t('admin.salary.totalStaff')}</p>
          <p className="text-2xl font-bold text-white">{users.length}</p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">{t('admin.salary.calculated')}</p>
          <p className="text-2xl font-bold text-green-400">{salaryRecords.length}</p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">{t('admin.salary.totalBase')}</p>
          <p className="text-2xl font-bold text-[#1B7A1E]">
            {users.reduce((sum, u) => sum + (u.monthlySalary || 0), 0).toLocaleString(dateLocale)}đ
          </p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">{t('admin.salary.totalNet')}</p>
          <p className="text-2xl font-bold text-orange-400">
            {salaryRecords.reduce((sum, r) => sum + r.finalSalary, 0).toLocaleString(dateLocale)}đ
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
        <table className="w-full">
          <thead className="bg-[#5e3ed0]/40 border-b border-white/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">{t('admin.salary.employee')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('admin.salary.baseSalary')}</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase">{t('admin.salary.absentDays')}</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase">{t('admin.salary.lateDays')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('admin.salary.salaryDeduction')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('admin.salary.netSalary')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-300 uppercase">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredUsers.map((user) => {
              const record = getSalaryRecord(user.uid);
              const baseSalary = user.monthlySalary || 0;

              return (
                <tr key={user.uid} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{user.displayName}</div>
                    <div className="text-sm text-slate-400">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-white">
                    {baseSalary.toLocaleString(dateLocale)}đ
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${record && record.absentDays > 0 ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-slate-400'
                      }`}>
                      {t('admin.salary.daysUnit', { n: record?.absentDays || 0 })}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${record && record.lateDays > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-slate-400'
                      }`}>
                      {t('admin.salary.daysUnit', { n: record?.lateDays || 0 })}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-red-400 font-medium">
                    -{(record?.deduction || 0).toLocaleString(dateLocale)}đ
                  </td>
                  <td className="px-6 py-4 text-right text-green-400 font-bold">
                    {(record?.finalSalary || baseSalary).toLocaleString(dateLocale)}đ
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      onClick={() => handleEdit(user)}
                      className="px-4 py-2 text-sm bg-[#1B7A1E] hover:bg-[#156318] border-none text-white shadow-[#1B7A1E]/25"
                    >
                      {record ? t('common.edit') : t('admin.salary.enter')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0E3A16] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">{t('admin.salary.enterPayroll')}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.salary.employee')}</label>
                <input
                  type="text"
                  value={users.find(u => u.uid === formData.userId)?.displayName || ''}
                  disabled
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.salary.month')}</label>
                <input
                  type="text"
                  value={selectedMonth}
                  disabled
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.salary.absentDays')}</label>
                  <input
                    type="number"
                    min="0"
                    max="26"
                    value={formData.absentDays}
                    onChange={(e) => setFormData({ ...formData, absentDays: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.salary.lateDays')}</label>
                  <input
                    type="number"
                    min="0"
                    max="26"
                    value={formData.lateDays}
                    onChange={(e) => setFormData({ ...formData, lateDays: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.salary.note')}</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white placeholder-slate-400"
                  placeholder={t('admin.salary.notePlaceholder')}
                />
              </div>

              {/* Preview */}
              {(() => {
                const user = users.find(u => u.uid === formData.userId);
                if (!user || !user.monthlySalary) return null;

                const { deduction, finalSalary } = calculateSalary(
                  user.monthlySalary,
                  formData.absentDays,
                  formData.lateDays
                );

                return (
                  <div className="bg-white/5 p-4 rounded-lg space-y-2 border border-white/10">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">{t('admin.salary.baseSalary')}:</span>
                      <span className="font-medium text-white">{user.monthlySalary.toLocaleString(dateLocale)}đ</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">{t('admin.salary.salaryDeduction')}:</span>
                      <span className="font-medium text-red-400">-{deduction.toLocaleString(dateLocale)}đ</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t border-white/10 pt-2">
                      <span className="text-white">{t('admin.salary.netSalary')}:</span>
                      <span className="text-green-400">{finalSalary.toLocaleString(dateLocale)}đ</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 bg-[#1B7A1E] hover:bg-[#156318] border-none text-white shadow-[#1B7A1E]/25">
                <Save size={18} />
                {t('common.save')}
              </Button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-white transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
