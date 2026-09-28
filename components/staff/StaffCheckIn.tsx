'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AttendanceRecord, CompanySettings } from '@/types/attendance';
import { Clock, CheckCircle, XCircle, Wifi, AlertCircle, Calendar, LogIn, LogOut, History, Camera, X, Phone, MapPin, Globe, Briefcase } from 'lucide-react';

export const StaffCheckIn: React.FC = () => {
  const { userProfile: user } = useAuth();
  const { t, dateLocale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [currentIP, setCurrentIP] = useState<string>('');
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [processing, setProcessing] = useState(false);

  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'checkin' | 'checkout'>('checkin');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(timer); stopCamera(); };
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      setCurrentIP(ipData.ip);

      const settingsSnapshot = await getDocs(collection(db, 'companySettings'));
      if (!settingsSnapshot.empty) {
        setCompanySettings({ ...settingsSnapshot.docs[0].data() } as CompanySettings);
      }

      const today = new Date().toISOString().split('T')[0];
      const attendanceRef = collection(db, 'attendanceRecords');
      const todayQuery = query(attendanceRef, where('userId', '==', user.uid), where('date', '==', today));
      const todaySnapshot = await getDocs(todayQuery);

      if (!todaySnapshot.empty) {
        const data = todaySnapshot.docs[0].data();
        setTodayRecord({ ...data, checkInTime: data.checkInTime?.toDate(), checkOutTime: data.checkOutTime?.toDate() } as AttendanceRecord);
      }

      // Load all records for statistics
      const allQuery = query(attendanceRef, where('userId', '==', user.uid));
      const allSnapshot = await getDocs(allQuery);
      const allRecs = allSnapshot.docs.map(doc => {
        const d = doc.data();
        return { ...d, checkInTime: d.checkInTime?.toDate(), checkOutTime: d.checkOutTime?.toDate() } as AttendanceRecord;
      }).sort((a, b) => b.date.localeCompare(a.date));
      setAllRecords(allRecs);

      // Load recent 7 days for display
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const recentQuery = query(attendanceRef, where('userId', '==', user.uid), where('date', '>=', weekAgo.toISOString().split('T')[0]));
      const recentSnapshot = await getDocs(recentQuery);
      const records = recentSnapshot.docs.map(doc => {
        const d = doc.data();
        return { ...d, checkInTime: d.checkInTime?.toDate(), checkOutTime: d.checkOutTime?.toDate() } as AttendanceRecord;
      }).sort((a, b) => b.date.localeCompare(a.date));
      setRecentRecords(records);
    } catch (error) { console.error('Error loading data:', error); } finally { setLoading(false); }
  };

  const isIPAllowed = () => companySettings && currentIP && companySettings.allowedIPs?.includes(currentIP);

  const calculateStatus = (checkInTime: Date): { status: AttendanceRecord['status'], lateMinutes: number } => {
    if (!companySettings) return { status: 'present', lateMinutes: 0 };
    const [startHour, startMinute] = companySettings.workStartTime.split(':').map(Number);
    const workStart = new Date(checkInTime); workStart.setHours(startHour, startMinute, 0, 0);
    const lateMinutes = Math.floor((checkInTime.getTime() - workStart.getTime()) / (1000 * 60));
    return lateMinutes <= (companySettings.lateThresholdMinutes || 15) ? { status: 'present', lateMinutes: 0 } : { status: 'late', lateMinutes };
  };

  // Camera functions
  const startCamera = async (mode: 'checkin' | 'checkout') => {
    try {
      setCameraMode(mode);
      setCapturedPhoto(null);
      setShowCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert(t('staff.cameraDenied'));
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCapturedPhoto(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const photoData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedPhoto(photoData);
        // Stop video stream after capture
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      }
    }
  };

  const retakePhoto = async () => {
    setCapturedPhoto(null);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    }
  };

  const uploadPhoto = async (photoData: string, type: 'checkin' | 'checkout'): Promise<string> => {
    try {
      console.log('Starting photo upload...', type);
      const today = new Date().toISOString().split('T')[0];
      const fileName = `attendance/${user?.uid}/${today}_${type}_${Date.now()}.jpg`;

      // Convert base64 to blob
      console.log('Converting base64 to blob...');
      const response = await fetch(photoData);
      const blob = await response.blob();
      console.log('Blob created:', blob.size, 'bytes');

      // Upload to Bunny Storage via API
      const formData = new FormData();
      formData.append('file', blob, `${type}_${Date.now()}.jpg`);
      formData.append('path', fileName);

      console.log('Uploading to Bunny...', fileName);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const uploadResponse = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Upload failed:', uploadResponse.status, errorText);
        throw new Error(t("staff.uploadError", { status: uploadResponse.status }));
      }

      const result = await uploadResponse.json();
      console.log('Upload successful:', result.url);
      return result.url;
    } catch (error: any) {
      console.error('Upload photo error:', error);
      if (error.name === 'AbortError') {
        throw new Error(t('staff.uploadTimeout'));
      }
      throw new Error(error.message || t('staff.uploadPhotoError'));
    }
  };

  const handleConfirmCheckIn = async () => {
    if (!user || !companySettings || !isIPAllowed() || !capturedPhoto) return;
    try {
      setProcessing(true);
      console.log('Starting check-in process...');

      const photoUrl = await uploadPhoto(capturedPhoto, 'checkin');
      console.log('Photo uploaded, saving to Firestore...');

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const { status, lateMinutes } = calculateStatus(now);
      const recordId = `${user.uid}_${today}`;
      const recordData: any = {
        id: recordId,
        userId: user.uid,
        userName: user.displayName,
        date: today,
        checkInTime: now,
        checkInIP: currentIP,
        checkInPhoto: photoUrl,
        status,
        createdAt: now,
        updatedAt: now
      };
      if (lateMinutes > 0) recordData.lateMinutes = lateMinutes;

      await setDoc(doc(db, 'attendanceRecords', recordId), recordData);
      console.log('Check-in saved successfully');

      stopCamera();
      alert(t('staff.checkInSuccess'));
      loadData();
    } catch (error: any) {
      console.error('Check-in error:', error);
      alert(t("staff.checkInError", { message: error.message || t("staff.checkInErrorFallback") }));
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmCheckOut = async () => {
    if (!user || !todayRecord || !isIPAllowed() || !capturedPhoto) return;
    try {
      setProcessing(true);
      const photoUrl = await uploadPhoto(capturedPhoto, 'checkout');
      const now = new Date();
      const workHours = Math.round(((now.getTime() - todayRecord.checkInTime.getTime()) / (1000 * 60 * 60)) * 10) / 10;
      let status = todayRecord.status;
      if (workHours < 4) status = 'half-day';
      await setDoc(doc(db, 'attendanceRecords', todayRecord.id), { ...todayRecord, checkOutTime: now, checkOutIP: currentIP, checkOutPhoto: photoUrl, workHours, status, updatedAt: now });
      stopCamera();
      alert(t('staff.checkOutSuccess'));
      loadData();
    } catch (error) { console.error('Error:', error); alert(t('staff.checkOutError')); } finally { setProcessing(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0E3A16] flex items-center justify-center">
      <div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1B7A1E] mx-auto mb-4"></div><p className="text-white/80">{t("common.loading")}</p></div>
    </div>
  );

  if (!companySettings) return (
    <div className="min-h-screen bg-[#0E3A16] flex items-center justify-center p-4">
      <div className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-2xl p-8 text-center max-w-md border border-white/10">
        <AlertCircle className="text-yellow-400 mx-auto mb-4" size={64} />
        <h2 className="text-xl font-bold text-white mb-2">{t("staff.notConfigured")}</h2>
        <p className="text-white/70">{t("staff.notConfiguredHint")}</p>
      </div>
    </div>
  );

  const ipAllowed = isIPAllowed();
  const hasCheckedIn = !!todayRecord;
  const hasCheckedOut = !!todayRecord?.checkOutTime;

  // Camera Modal
  if (showCamera) {
    return (
      <div className="min-h-screen bg-[#1a103d] flex flex-col">
        <div className="flex items-center justify-between p-4 bg-black/50 backdrop-blur-md border-b border-white/10">
          <h2 className="text-white font-bold text-lg">{t("staff.captureTitle", { mode: cameraMode === "checkin" ? t("staff.checkInBtn") : t("staff.checkOutBtn") })}</h2>
          <button onClick={stopCamera} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X className="text-white" size={24} /></button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-md aspect-[4/3] bg-black rounded-2xl overflow-hidden mb-6 shadow-2xl border border-white/10">
            {!capturedPhoto ? (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
            )}
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay frame */}
            <div className="absolute inset-0 border-4 border-white/30 rounded-2xl pointer-events-none">
              <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-[#1B7A1E] rounded-tl-lg"></div>
              <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-[#1B7A1E] rounded-tr-lg"></div>
              <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-[#1B7A1E] rounded-bl-lg"></div>
              <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-[#1B7A1E] rounded-br-lg"></div>
            </div>
          </div>

          <p className="text-white/60 text-center mb-6">
            {!capturedPhoto ? t('staff.placeFaceHint') : t('staff.confirmOrRetake')}
          </p>

          <div className="flex gap-4 w-full max-w-md">
            {!capturedPhoto ? (
              <button
                onClick={capturePhoto}
                className="flex-1 bg-[#1B7A1E] hover:bg-[#156318] text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-[#1B7A1E]/25 transition-all flex items-center justify-center gap-2"
              >
                <Camera size={24} />
                {t("staff.capturePhoto")}
              </button>
            ) : (
              <>
                <button
                  onClick={retakePhoto}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white py-4 rounded-xl font-bold transition-all border border-white/10"
                  disabled={processing}
                >
                  {t("staff.retakePhoto")}
                </button>
                <button
                  onClick={cameraMode === 'checkin' ? handleConfirmCheckIn : handleConfirmCheckOut}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-500/25 transition-all flex items-center justify-center gap-2"
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      {t("staff.processing")}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={24} />
                      {t("common.confirm")}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        {/* Status Badge */}
        <div className="text-center mb-6 pt-4">
          <div className="inline-flex items-center gap-2 bg-[#5e3ed0]/20 backdrop-blur-lg px-4 py-2 rounded-full border border-white/10">
            <div className={`w-2 h-2 rounded-full ${ipAllowed ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
            <span className="text-white/80 text-sm">{ipAllowed ? t('staff.connectedCompanyNet') : t('staff.notConnectedCompanyNet')}</span>
          </div>
        </div>

        {/* Profile and Info Section */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          {/* Left: Profile Photo and Basic Info */}
          <div className="md:col-span-1">
            <div className="bg-[#5e3ed0]/20 backdrop-blur-lg rounded-3xl p-6 border border-white/10 h-full">
              <div className="flex flex-col items-center mb-6">
                <div className="relative mb-4">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-32 h-32 rounded-full object-cover border-4 border-white/30 shadow-xl"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#1B7A1E] to-blue-600 flex items-center justify-center text-white text-5xl font-bold border-4 border-white/30 shadow-xl">
                      {user?.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-[#0E3A16] ${ipAllowed ? 'bg-green-400' : 'bg-red-400'}`}></div>
                </div>
                <h2 className="text-xl font-bold text-white text-center mb-1">{user?.displayName}</h2>
                <p className="text-white/60 text-xs text-center mb-3">{user?.email}</p>
                {user?.position && (
                  <div className="px-4 py-1 bg-white/10 rounded-full">
                    <p className="text-white/80 text-sm">{user.position}</p>
                  </div>
                )}
              </div>

              {/* Basic Info */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <h3 className="text-white/80 font-semibold text-sm mb-3">{t("staff.basicInfo")}</h3>

                {user?.phoneNumber && (
                  <div className="flex items-start gap-3">
                    <Phone className="text-[#1B7A1E] flex-shrink-0 mt-0.5" size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/50 text-xs">{t("common.phone")}</p>
                      <p className="text-white text-sm break-all">{user.phoneNumber}</p>
                    </div>
                  </div>
                )}

                {user?.dateOfBirth && (
                  <div className="flex items-start gap-3">
                    <Calendar className="text-[#1B7A1E] flex-shrink-0 mt-0.5" size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/50 text-xs">{t("profile.dateOfBirth")}</p>
                      <p className="text-white text-sm">{new Date(user.dateOfBirth).toLocaleDateString(dateLocale)}</p>
                    </div>
                  </div>
                )}

                {user?.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-[#1B7A1E] flex-shrink-0 mt-0.5" size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/50 text-xs">{t("common.address")}</p>
                      <p className="text-white text-sm break-words">{user.address}</p>
                    </div>
                  </div>
                )}

                {user?.workLocation && (
                  <div className="flex items-start gap-3">
                    <Briefcase className="text-[#1B7A1E] flex-shrink-0 mt-0.5" size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/50 text-xs">{t("profile.workLocation")}</p>
                      <p className="text-white text-sm break-words">{user.workLocation}</p>
                    </div>
                  </div>
                )}

                {user?.country && (
                  <div className="flex items-start gap-3">
                    <Globe className="text-[#1B7A1E] flex-shrink-0 mt-0.5" size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/50 text-xs">{t("common.country")}</p>
                      <p className="text-white text-sm">{user.country}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Basic Info and Attendance Info */}
          <div className="md:col-span-2 space-y-6">
            {/* Clock Card */}
            <div className="bg-[#5e3ed0]/20 backdrop-blur-lg rounded-3xl p-6 border border-white/10">
              <div className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-white mb-2 font-mono tracking-wider">
                  {currentTime.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className="text-white/60 text-base">
                  {currentTime.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div className="flex justify-center gap-8 mt-6 pt-4 border-t border-white/10">
                <div className="text-center">
                  <p className="text-white/50 text-sm">{t("staff.checkInTime")}</p>
                  <p className="text-xl font-bold text-white">{companySettings.workStartTime}</p>
                </div>
                <div className="w-px bg-white/20"></div>
                <div className="text-center">
                  <p className="text-white/50 text-sm">{t("staff.checkOutTime")}</p>
                  <p className="text-xl font-bold text-white">{companySettings.workEndTime}</p>
                </div>
              </div>
            </div>

            {/* Today's Attendance Status */}
            {todayRecord && (
              <div className="bg-[#5e3ed0]/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Calendar size={20} /> {t("staff.checkInToday")}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    {todayRecord.checkInPhoto ? (
                      <img src={todayRecord.checkInPhoto} alt="Check-in" className="w-12 h-12 rounded-full mx-auto mb-2 object-cover border-2 border-green-400" />
                    ) : (
                      <LogIn className="text-green-400 mx-auto mb-2" size={24} />
                    )}
                    <p className="text-white/50 text-xs">Check-in</p>
                    <p className="text-white font-bold">{todayRecord.checkInTime?.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    {todayRecord.checkOutPhoto ? (
                      <img src={todayRecord.checkOutPhoto} alt="Check-out" className="w-12 h-12 rounded-full mx-auto mb-2 object-cover border-2 border-orange-400" />
                    ) : (
                      <LogOut className="text-orange-400 mx-auto mb-2" size={24} />
                    )}
                    <p className="text-white/50 text-xs">Check-out</p>
                    <p className="text-white font-bold">{todayRecord.checkOutTime?.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) || '--:--'}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <Clock className="text-blue-400 mx-auto mb-2" size={24} />
                    <p className="text-white/50 text-xs">{t("staff.hoursCount")}</p>
                    <p className="text-white font-bold">{todayRecord.workHours ? `${todayRecord.workHours}h` : '--'}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <CheckCircle className={`mx-auto mb-2 ${todayRecord.status === 'present' ? 'text-green-400' : todayRecord.status === 'late' ? 'text-yellow-400' : 'text-orange-400'}`} size={24} />
                    <p className="text-white/50 text-xs">{t("staff.statusLabel")}</p>
                    <p className={`font-bold ${todayRecord.status === 'present' ? 'text-green-400' : todayRecord.status === 'late' ? 'text-yellow-400' : 'text-orange-400'}`}>
                      {todayRecord.status === 'present' ? t('staff.onTime') : todayRecord.status === 'late' ? t('staff.late') : t('staff.halfDay')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-[#5e3ed0]/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10 mb-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <History size={20} /> {t("staff.attendanceStats")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="text-green-400" size={24} />
              </div>
              <p className="text-white/50 text-xs mb-1">{t("staff.workDays")}</p>
              <p className="text-3xl font-bold text-white mb-1">
                {allRecords.filter(r => r.status === 'present' || r.status === 'late').length}
              </p>
              <p className="text-white/40 text-xs">{t("staff.daysUnit")}</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Clock className="text-blue-400" size={24} />
              </div>
              <p className="text-white/50 text-xs mb-1">{t("staff.totalWorkHours")}</p>
              <p className="text-3xl font-bold text-white mb-1">
                {allRecords.reduce((sum, r) => sum + (r.workHours || 0), 0).toFixed(1)}
              </p>
              <p className="text-white/40 text-xs">{t("staff.hoursUnit")}</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="text-yellow-400" size={24} />
              </div>
              <p className="text-white/50 text-xs mb-1">{t("staff.totalLateMinutes")}</p>
              <p className="text-3xl font-bold text-white mb-1">
                {allRecords.reduce((sum, r) => sum + (r.lateMinutes || 0), 0)}
              </p>
              <p className="text-white/40 text-xs">{t("staff.minutesUnit")}</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Calendar className="text-orange-400" size={24} />
              </div>
              <p className="text-white/50 text-xs mb-1">{t("staff.halfDay")}</p>
              <p className="text-3xl font-bold text-white mb-1">
                {allRecords.filter(r => r.status === 'half-day').length}
              </p>
              <p className="text-white/40 text-xs">{t("staff.daysUnit")}</p>
            </div>
          </div>
        </div>

        {/* IP Status */}
        <div className={`rounded-2xl p-4 mb-6 ${ipAllowed ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${ipAllowed ? 'bg-green-500/30' : 'bg-red-500/30'}`}>
              <Wifi className={ipAllowed ? 'text-green-400' : 'text-red-400'} size={24} />
            </div>
            <div className="flex-1">
              <p className={`font-medium ${ipAllowed ? 'text-green-300' : 'text-red-300'}`}>{ipAllowed ? t('staff.companyNetConfirmed') : t('staff.notCompanyNet')}</p>
              <p className={`text-sm font-mono ${ipAllowed ? 'text-green-400/70' : 'text-red-400/70'}`}>IP: {currentIP}</p>
            </div>
            {ipAllowed ? <CheckCircle className="text-green-400" size={28} /> : <XCircle className="text-red-400" size={28} />}
          </div>
        </div>

        {/* Action Buttons - Now opens camera */}
        <div className="space-y-4 mb-8">
          {!hasCheckedIn && (
            <button onClick={() => startCamera('checkin')} disabled={!ipAllowed}
              className={`w-full py-6 rounded-2xl text-xl font-bold flex items-center justify-center gap-3 transition-all ${ipAllowed ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/30' : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}>
              <Camera size={28} /> CHECK-IN
            </button>
          )}

          {hasCheckedIn && !hasCheckedOut && (
            <button onClick={() => startCamera('checkout')} disabled={!ipAllowed}
              className={`w-full py-6 rounded-2xl text-xl font-bold flex items-center justify-center gap-3 transition-all ${ipAllowed ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-lg shadow-orange-500/30' : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}>
              <Camera size={28} /> CHECK-OUT
            </button>
          )}

          {hasCheckedOut && (
            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-2xl p-8 text-center">
              <div className="w-20 h-20 bg-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-green-400" size={40} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{t("staff.doneTitle")}</h3>
              <p className="text-white/60">{t("staff.doneHint")}</p>
            </div>
          )}
        </div>

        {/* Recent History with Photos */}
        {recentRecords.length > 0 && (
          <div className="bg-[#5e3ed0]/20 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-white font-semibold flex items-center gap-2"><History size={20} /> {t("staff.recentHistory")}</h3>
            </div>
            <div className="divide-y divide-white/10">
              {recentRecords.slice(0, 7).map((record) => (
                <div key={record.id} className="p-4 flex items-center justify-between hover:bg-white/5">
                  <div className="flex items-center gap-4">
                    {record.checkInPhoto ? (
                      <img src={record.checkInPhoto} alt="Check-in" className="w-10 h-10 rounded-lg object-cover border border-white/20" />
                    ) : (
                      <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                        <Calendar className="text-white/60" size={18} />
                      </div>
                    )}
                    <div>
                      <p className="text-white font-medium">{new Date(record.date).toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'numeric' })}</p>
                      <p className="text-white/50 text-sm">
                        {record.checkInTime?.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                        {record.checkOutTime && ` - ${record.checkOutTime.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${record.status === 'present' ? 'bg-green-500/20 text-green-400' :
                    record.status === 'late' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-orange-500/20 text-orange-400'
                    }`}>
                    {record.status === 'present' ? t('staff.onTime') : record.status === 'late' ? t('staff.lateMinutes', { minutes: record.lateMinutes ?? 0 }) : t('staff.halfDay')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!ipAllowed && (
          <div className="mt-6 bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4 text-center backdrop-blur-md">
            <p className="text-yellow-300 text-sm">{t("staff.connectWifiHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
};
