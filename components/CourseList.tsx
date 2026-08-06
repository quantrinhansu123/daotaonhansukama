'use client';

import React from 'react';
import { Star, User, Clock, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { useLanguage } from '@/contexts/LanguageContext';

export const CourseList: React.FC = () => {
  const { t } = useLanguage();

  const courses = [
    {
      id: 1,
      title: t('landing.courses.c1.title'),
      instructor: t('landing.courses.c1.instructor'),
      rating: 4.9,
      students: 450,
      duration: t('landing.courses.c1.duration'),
      price: t('landing.courses.internal'),
      image: "https://picsum.photos/400/250?random=1",
      tag: t('landing.courses.c1.tag')
    },
    {
      id: 2,
      title: t('landing.courses.c2.title'),
      instructor: t('landing.courses.c2.instructor'),
      rating: 4.8,
      students: 380,
      duration: t('landing.courses.c2.duration'),
      price: t('landing.courses.internal'),
      image: "https://picsum.photos/400/250?random=2",
      tag: t('landing.courses.c2.tag')
    },
    {
      id: 3,
      title: t('landing.courses.c3.title'),
      instructor: t('landing.courses.c3.instructor'),
      rating: 4.9,
      students: 520,
      duration: t('landing.courses.c3.duration'),
      price: t('landing.courses.internal'),
      image: "https://picsum.photos/400/250?random=3",
      tag: t('landing.courses.c3.tag')
    }
  ];

  return (
    <section id="courses" className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900">{t('landing.courses.title')}</h2>
            <p className="mt-2 text-slate-600">{t('landing.courses.subtitle')}</p>
          </div>
          <Button variant="outline">
            {t('landing.courses.viewAll')} <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {courses.map((course) => (
            <div key={course.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group">
              <div className="relative overflow-hidden">
                <img 
                  src={course.image} 
                  alt={course.title} 
                  className="w-full h-48 object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
                <span className="absolute top-4 left-4 bg-white/90 backdrop-blur text-brand-700 text-xs font-bold px-3 py-1 rounded-full">
                  {course.tag}
                </span>
              </div>
              
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><User size={14} /> {course.instructor}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Clock size={14} /> {course.duration}</span>
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 hover:text-brand-600 transition-colors cursor-pointer">
                  {course.title}
                </h3>
                
                <div className="flex items-center gap-1 mb-4">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-slate-900">{course.rating}</span>
                  <span className="text-slate-500 text-sm">{t('landing.courses.staffCount', { count: course.students.toLocaleString() })}</span>
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <span className="text-xl font-bold text-brand-600">{course.price}</span>
                  <button className="text-sm font-semibold text-slate-900 hover:text-brand-600 transition-colors">
                    {t('landing.courses.viewDetails')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
