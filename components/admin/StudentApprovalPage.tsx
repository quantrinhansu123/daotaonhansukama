'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { UserProfile } from '@/types/user';
import { ArrowLeft, CheckCircle, XCircle, Search } from 'lucide-react';
import { Button } from '@/components/Button';

interface PendingRequest {
  courseId: string;
  courseTitle: string;
  userId: string;
  userName: string;
  userEmail: string;
}

interface StudentApprovalPageProps {
  onBack: () => void;
}

export const StudentApprovalPage: React.FC<StudentApprovalPageProps> = ({ onBack }) => {
  const { t, dateLocale } = useLanguage();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [requests, searchTerm]);

  const loadRequests = async () => {
    try {
      setLoading(true);

      // Load all courses
      const coursesSnapshot = await getDocs(collection(db, 'courses'));
      const courses = coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Course[];

      // Load all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          uid: data.uid || doc.id // Ensure uid is always present
        };
      }) as UserProfile[];

      // Build pending requests list
      const pendingRequests: PendingRequest[] = [];

      courses.forEach(course => {
        if (course.pendingStudents && course.pendingStudents.length > 0) {
          course.pendingStudents.forEach(userId => {
            // Filter out undefined or empty userIds
            if (!userId || userId.trim() === '') return;
            
            const user = users.find(u => u.uid === userId.trim());
            if (user && user.uid) {
              pendingRequests.push({
                courseId: course.id || '',
                courseTitle: course.title || '',
                userId: user.uid,
                userName: user.displayName || user.email || '',
                userEmail: user.email || '',
              });
            }
          });
        }
      });

      setRequests(pendingRequests);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterRequests = () => {
    let filtered = requests;
    if (searchTerm) {
      filtered = filtered.filter(req =>
        req.courseTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredRequests(filtered);
  };

  const handleApprove = async (request: PendingRequest) => {
    if (!request.userId || request.userId.trim() === '' || !request.courseId || request.courseId.trim() === '') {
      alert(t('admin.approvals.invalidRequest'));
      return;
    }

    try {
      setProcessing(request.userId + request.courseId);
      const courseRef = doc(db, 'courses', request.courseId);
      const validUserId = request.userId.trim();

      await updateDoc(courseRef, {
        students: arrayUnion(validUserId),
        pendingStudents: arrayRemove(validUserId)
      });

      alert(t('admin.approvals.approveSuccess'));
      loadRequests();
    } catch (error) {
      console.error('Error approving:', error);
      alert(t('admin.approvals.approveError'));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (request: PendingRequest) => {
    if (!request.userId || request.userId.trim() === '' || !request.courseId || request.courseId.trim() === '') {
      alert(t('admin.approvals.invalidRequest'));
      return;
    }

    if (!confirm(t('admin.approvals.confirmReject', { name: request.userName }))) return;

    try {
      setProcessing(request.userId + request.courseId);
      const courseRef = doc(db, 'courses', request.courseId);
      const validUserId = request.userId.trim();

      await updateDoc(courseRef, {
        pendingStudents: arrayRemove(validUserId)
      });

      alert(t('admin.approvals.rejectSuccess'));
      loadRequests();
    } catch (error) {
      console.error('Error rejecting:', error);
      alert(t('admin.approvals.rejectError'));
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">{t('common.loading')}</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="text-[#53cafd] hover:text-[#3db9f5] flex items-center gap-2 font-medium mb-4"
        >
          <ArrowLeft size={20} />
          {t('common.back')}
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{t('admin.approvals.titleAlt')}</h2>
            <p className="text-slate-300">{t('admin.approvals.subtitleAlt')}</p>
          </div>
          <div className="text-center bg-yellow-500/20 px-6 py-3 rounded-xl border border-yellow-500/30">
            <div className="text-3xl font-bold text-yellow-400">{requests.length}</div>
            <div className="text-sm text-yellow-400">{t('admin.approvals.pendingCount')}</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder={t('admin.approvals.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400"
        />
      </div>

      {/* Requests Table */}
      {filteredRequests.length === 0 ? (
        <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 p-12 text-center backdrop-blur-md">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <p className="text-slate-300 text-lg">{t('admin.approvals.noPending')}</p>
        </div>
      ) : (
        <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
          <table className="w-full">
            <thead className="bg-[#5e3ed0]/40 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">{t('admin.approvals.employee')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">{t('common.email')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">{t('admin.approvals.course')}</th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-slate-300">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredRequests.map((request) => {
                const isProcessing = processing === request.userId + request.courseId;
                return (
                  <tr key={request.userId + request.courseId} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{request.userName}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{request.userEmail}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{request.courseTitle}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleApprove(request)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition-colors"
                        >
                          <CheckCircle size={16} />
                          {isProcessing ? t('common.processing') : t('admin.approvals.approve')}
                        </button>
                        <button
                          onClick={() => handleReject(request)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition-colors"
                        >
                          <XCircle size={16} />
                          {isProcessing ? t('common.processing') : t('admin.approvals.reject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
