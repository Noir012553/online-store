import { useState, useEffect } from "react";
import { Target, Eye, Heart, Award, Users, TrendingUp } from "lucide-react";
import { productAPI } from "../lib/api";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { useAuth } from "../lib/context/AuthContext";
import { useLanguage } from "../lib/i18n";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

interface Stat {
  label: string;
  value: string | number;
}

interface Testimonial {
  name: string;
  role: string;
  content: string;
  avatar: string;
  rating?: number;
}

function AboutContent() {
  const { isAdmin } = useAuth();
  const { t, loadNamespace } = useLanguage();
  const [stats, setStats] = useState<Stat[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNamespace('about');
  }, [loadNamespace]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [statsRes, testimonialsRes] = await Promise.all([
          productAPI.getStatsOverview(),
          productAPI.getTestimonials(3),
        ]);

        const statsData = [
          { label: t('stats_experience', 'about'), value: t('about_stats_experience', 'about') },
          { label: `${t('stats_customers', 'about')}: ${statsRes.totalCustomers}K+`, value: `${statsRes.totalCustomers}K+` },
          { label: `${t('stats_products', 'about')}: ${statsRes.totalProducts}+`, value: `${statsRes.totalProducts}+` },
          { label: `${t('stats_rating', 'about')}: ${t('about_stats_rating', 'about')}`, value: t('about_stats_rating', 'about') },
        ];
        setStats(statsData);
        setTestimonials(testimonialsRes || []);
      } catch (error) {
        setStats([
          { label: t('stats_experience', 'about'), value: t('about_stats_experience', 'about') },
          { label: `${t('stats_customers', 'about')}: ${t('about_stats_customers', 'about')}`, value: t('about_stats_customers', 'about') },
          { label: `${t('stats_products', 'about')}: ${t('about_stats_products', 'about')}`, value: t('about_stats_products', 'about') },
          { label: `${t('stats_rating', 'about')}: ${t('about_stats_rating', 'about')}`, value: t('about_stats_rating', 'about') },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [t]);

  const values = [
    {
      icon: Award,
      titleKey: 'value_warranty_title',
      descKey: 'value_warranty_desc',
    },
    {
      icon: Heart,
      titleKey: 'value_support_title',
      descKey: 'value_support_desc',
    },
    {
      icon: Users,
      titleKey: 'value_trust_title',
      descKey: 'value_trust_desc',
    },
    {
      icon: TrendingUp,
      titleKey: 'value_growth_title',
      descKey: 'value_growth_desc',
    },
  ];

  const team = [
    {
      nameKey: "team_member_1",
      roleKey: 'team_member_1_role',
      image: "/uploads/team/team-1.jpg",
    },
    {
      nameKey: "team_member_2",
      roleKey: 'team_member_2_role',
      image: "/uploads/team/team-2.jpg",
    },
    {
      nameKey: "team_member_3",
      roleKey: 'team_member_3_role',
      image: "/uploads/team/team-3.jpg",
    },
    {
      nameKey: "team_member_4",
      roleKey: 'team_member_4_role',
      image: "/uploads/team/team-4.jpg",
    },
  ];

  const commitmentKeys = [
    'commitment_1',
    'commitment_2',
    'commitment_3',
    'commitment_4',
    'commitment_5',
    'commitment_6',
  ];

  return (
    <div>
      <section className="relative overflow-hidden" style={{ height: "calc(100vh - 80px)" }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover blur-[4px] scale-110"
        >
          <source
            src="/assets/videos/about-hero.mp4"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-black/75" />
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="text-white max-w-2xl">
            <h1 className="text-white mb-4">{t('page_title', 'about')}</h1>
            <p className="text-xl">
              {t('hero_subtitle', 'about')}
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl text-red-600 mb-2">{stat.value}</div>
              <div className="text-gray-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="mb-6">{t('history_title', 'about')}</h2>
              <p className="text-gray-700 mb-4">
                {t('history_para1', 'about')}
              </p>
              <p className="text-gray-700 mb-4">
                {t('history_para2', 'about')}
              </p>
              <p className="text-gray-700">
                {t('history_para3', 'about')}
              </p>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg shadow-lg">
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1706101035106-119828e7b564?w=600"
                alt={t('history_image_alt', 'about')}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                loading="lazy"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <div className="bg-red-50 p-8 rounded-lg text-center">
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mb-4 mx-auto">
              <Target className="w-6 h-6 text-white" />
            </div>
            <h2 className="mb-4">{t('vision_title', 'about')}</h2>
            <p className="text-gray-700">
              {t('vision_desc', 'about')}
            </p>
          </div>
          <div className="bg-red-50 p-8 rounded-lg text-center">
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mb-4 mx-auto">
              <Eye className="w-6 h-6 text-white" />
            </div>
            <h2 className="mb-4">{t('mission_title', 'about')}</h2>
            <p className="text-gray-700">
              {t('mission_desc', 'about')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map((value, index) => {
            const Icon = value.icon;
            return (
              <div key={index} className="bg-white border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="mb-2">{t(value.titleKey, 'about')}</h3>
                <p className="text-gray-600 text-sm">{t(value.descKey, 'about')}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-center mb-4 text-3xl font-bold">{t('team_title', 'about')}</h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg font-semibold">
            {t('team_subtitle', 'about')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <div key={index} className="bg-white rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                <img
                  src={member.image}
                  alt={t(member.nameKey, 'about')}
                  loading="lazy"
                  className="w-full h-80 object-cover"
                />
                <div className="p-6 text-center">
                  <h3 className="mb-1">{t(member.nameKey, 'about')}</h3>
                  <p className="text-gray-600">{t(member.roleKey, 'about')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center mb-12 font-bold">{t('commitments_title', 'about')}</h2>
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {commitmentKeys.map((key, index) => (
              <div key={index} className="flex items-start gap-3 bg-white border rounded-lg p-4">
                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-white text-sm">✓</span>
                </div>
                <span className="text-gray-700">{t(key, 'about')}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!isAdmin && testimonials.length > 0 && (
        <section className="bg-linear-to-r from-red-600 to-red-800 py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-center text-white mb-12 font-bold">{t('testimonials_title', 'about')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <div key={index} className="bg-white rounded-lg p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      loading="lazy"
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <h4>{testimonial.name}</h4>
                      <p className="text-sm text-gray-600">
                        {testimonial.role === 'Khách hàng' || testimonial.role === 'Customer'
                          ? t('testimonial_customer_role', 'about')
                          : testimonial.role}
                      </p>
                    </div>
                  </div>
                  <p className="text-black font-bold text-base italic">"{testimonial.content}"</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function About() {
  return <AboutContent />;
}
