'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, getDocs, doc, setDoc, query, where } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { DollarSign, Search, Download, Calendar, TrendingUp } from 'lucide-react';
import { Button } from '@/components/Button';

interface SalaryRecord {
  id: string;
  userId: string;
  userName: string;
  department: string;
  baseSalary: number;
  bonus: number;
  deduction: number;
  totalSalary: number;
  month: string;
  year: number;
  status: 'pending' | 'paid';
}

export const SalaryManagement: React.FC = () => {
  const { t, dateLocale } = useLanguage();
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadSalaries();
  }, [selectedMonth, selectedYear]);

  const loadSalaries = async () => {
    try {
      setLoading(true);
      // Load users with role staff
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const staffUsers = usersSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter((u: any) => u.role === 'staff');

      // Generate salary records (mock data for now)
      const salaryRecords: SalaryRecord[] = staffUsers.map((user: any) => ({
        id: `${user.id}_${selectedYear}_${selectedMonth}`,
        userId: user.id,
        userName: user.displayName || user.email,
        department: t('admin.salary.unassigned'),
        baseSalary: 10000000,
        bonus: 0,
        deduction: 0,
        totalSalary: 10000000,
        month: selectedMonth.toString().padStart(2, '0'),
        year: selectedYear,
        status: 'pending',
      }));

      setSalaries(salaryRecords);
    } catch (error) {
      console.error('Error loading salaries:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSalaries = salaries.filter(s =>
    s.userName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSalary = filteredSalaries.reduce((sum, s) => sum + s.totalSalary, 0);
  const totalBonus = filteredSalaries.reduce((sum, s) => sum + s.bonus, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(dateLocale, { style: 'currency', currency: 'VND' }).format(amount);
  };

  if (loading) {
    return <div className="p-8 text-center">{t('common.loading')}</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">{t('admin.salary.title')}</h1>
        <p className="text-slate-300">{t('admin.salary.subtitleAlt')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#5e3ed0]/20 rounded-xl p-6 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-green-500/20 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">{t('admin.salary.totalMonth')}</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(totalSalary)}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#5e3ed0]/20 rounded-xl p-6 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-500/20 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">{t('admin.salary.totalBonus')}</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(totalBonus)}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#5e3ed0]/20 rounded-xl p-6 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-purple-500/20 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">{t('admin.salary.staffCount')}</p>
              <p className="text-2xl font-bold text-white">{filteredSalaries.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#5e3ed0]/20 rounded-xl p-6 border border-white/10 mb-6 backdrop-blur-md">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder={t('admin.salary.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white placeholder-slate-400"
              />
            </div>
          </div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white [&>option]:bg-[#0E3A16] [&>option]:text-white"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
              <option key={month} value={month}>{t('admin.salary.monthN', { n: month })}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white [&>option]:bg-[#0E3A16] [&>option]:text-white"
          >
            {[2024, 2025, 2026].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <Button className="flex items-center gap-2 bg-[#1B7A1E] hover:bg-[#156318] border-none text-white shadow-[#1B7A1E]/25">
            <Download size={18} />
            {t('admin.salary.export')}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#5e3ed0]/40 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">{t('admin.salary.employee')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">{t('admin.salary.department')}</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-white">{t('admin.salary.baseSalary')}</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-white">{t('admin.salary.bonus')}</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-white">{t('admin.salary.deduction')}</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-white">{t('admin.salary.total')}</th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-white">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredSalaries.map((salary) => (
                <tr key={salary.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{salary.userName}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{salary.department}</td>
                  <td className="px-6 py-4 text-right text-white">{formatCurrency(salary.baseSalary)}</td>
                  <td className="px-6 py-4 text-right text-green-400">{formatCurrency(salary.bonus)}</td>
                  <td className="px-6 py-4 text-right text-red-400">{formatCurrency(salary.deduction)}</td>
                  <td className="px-6 py-4 text-right font-bold text-[#1B7A1E]">{formatCurrency(salary.totalSalary)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${salary.status === 'paid'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                      {salary.status === 'paid' ? t('admin.salary.paid') : t('admin.salary.pending')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredSalaries.length === 0 && (
        <div className="text-center py-12 bg-[#5e3ed0]/20 rounded-xl border border-white/10 mt-6 backdrop-blur-md">
          <DollarSign className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-300">{t('admin.salary.noRecords')}</p>
        </div>
      )}
    </div>
  );
};
