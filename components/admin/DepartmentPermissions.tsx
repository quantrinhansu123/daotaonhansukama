'use client';

import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Department } from '@/types/department';
import { PERMISSIONS, PermissionAction } from '@/types/permission';
import { Shield, Save, X } from 'lucide-react';
import { Button } from '@/components/Button';

interface DepartmentPermissionsProps {
  department: Department;
  onClose: () => void;
  onUpdate: () => void;
}

export const DepartmentPermissions: React.FC<DepartmentPermissionsProps> = ({
  department,
  onClose,
  onUpdate
}) => {
  const { t } = useLanguage();
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionAction[]>(
    department.permissions || []
  );
  const [saving, setSaving] = useState(false);

  const togglePermission = (permission: PermissionAction) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const deptRef = doc(db, 'departments', department.id);
      await updateDoc(deptRef, {
        permissions: selectedPermissions,
        updatedAt: new Date()
      });
      alert(t('admin.permissions.saveSuccess'));
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating permissions:', error);
      alert(t('admin.permissions.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const selectAll = () => {
    setSelectedPermissions(PERMISSIONS.map(p => p.action));
  };

  const clearAll = () => {
    setSelectedPermissions([]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#311898] border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#5e3ed0]/20">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 rounded-xl">
              <Shield className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{t('admin.permissions.title')}</h3>
              <p className="text-sm text-slate-300">{department.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={24} className="text-slate-300 hover:text-white" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="p-4 bg-white/5 border-b border-white/10 flex gap-3">
          <button
            onClick={selectAll}
            className="px-4 py-2 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors font-medium border border-blue-500/30"
          >
            {t('admin.permissions.selectAll')}
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2 text-sm bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 transition-colors font-medium border border-white/10"
          >
            {t('admin.permissions.deselectAll')}
          </button>
          <div className="ml-auto text-sm text-slate-300 flex items-center">
            {t('admin.permissions.selectedCount')} <span className="font-bold ml-1 text-white">{selectedPermissions.length}/{PERMISSIONS.length}</span>
          </div>
        </div>

        {/* Permissions List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PERMISSIONS.map((permission) => {
              const isSelected = selectedPermissions.includes(permission.action);
              return (
                <label
                  key={permission.id}
                  className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${isSelected
                      ? 'border-purple-500/50 bg-purple-500/20 shadow-md'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePermission(permission.action)}
                    className="mt-1 w-5 h-5 text-purple-500 rounded focus:ring-purple-500 cursor-pointer bg-white/10 border-white/20"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-white mb-1">
                      {t(`admin.permissions.${permission.action}`)}
                    </div>
                    <div className="text-sm text-slate-300">
                      {t(`admin.permissions.${permission.action}_desc`)}
                    </div>
                    <div className="mt-2">
                      <code className="text-xs bg-white/10 px-2 py-1 rounded text-slate-300">
                        {permission.action}
                      </code>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25"
          >
            <Save size={18} />
            {saving ? t('admin.permissions.saving') : t('admin.permissions.savePermissions')}
          </Button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-colors font-medium text-white"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
