<script setup>
import SiteNav from './components/SiteNav.vue';
import HeroSection from './components/HeroSection.vue';
import HowItWorks from './components/HowItWorks.vue';
import FeatureGrid from './components/FeatureGrid.vue';
import TemplatesShowcase from './components/TemplatesShowcase.vue';
import FinalCta from './components/FinalCta.vue';
import SiteFooter from './components/SiteFooter.vue';
</script>

<template>
  <SiteNav />
  <main>
    <HeroSection />
    <HowItWorks />
    <FeatureGrid />
    <TemplatesShowcase />
    <FinalCta />
  </main>
  <SiteFooter />
</template>
