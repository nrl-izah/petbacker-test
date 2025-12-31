<script setup lang="ts">
import InfiniteScroller from './components/InfiniteScroller.vue';
import GpsTracker from './components/GpsTracker.vue';
import { ref } from 'vue';

const currentTask = ref<'scroll' | 'gps'>('gps'); // Start on Task 1 (GPS)


</script>

<template>
  <div class="app-container">
    
    <!-- Task Selector Buttons -->
    <div class="task-selector-bar">
      <button 
        @click="currentTask = 'gps'" 
        :class="['task-button', currentTask === 'gps' ? 'active-button' : '']"
      >
        Task 1: GPS Tracker
      </button>
      <button 
        @click="currentTask = 'scroll'" 
        :class="['task-button', currentTask === 'scroll' ? 'active-button' : '']"
      >
        Task 2: Infinite Scroll
      </button>
    </div>

    <!-- Component Rendering Area -->
    <div class="component-area">
      <GpsTracker v-if="currentTask === 'gps'" />
      <InfiniteScroller v-else-if="currentTask === 'scroll'" />
    </div>
  </div>
</template>

<style>
/* Global Styles */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100vh;
  font-family: 'Inter', sans-serif;
}

.app-container {
  min-height: 100vh;
  background-color: #f9fafb; 
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px; 
  box-sizing: border-box;
}

/* Task Selector Styles */
.task-selector-bar {
  padding: 8px; 
  margin-bottom: 24px; 
  background-color: #ffffff; 
  border-radius: 12px; 
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06); 
  display: flex;
  gap: 8px; 
}

.task-button {
  padding: 8px 16px; 
  font-size: 0.875rem; 
  font-weight: 500; 
  border-radius: 8px; 
  transition: all 0.2s ease-in-out;
  cursor: pointer;
  border: none;
  background-color: #f3f4f6; 
  color: #374151; 
}

.task-button:hover:not(.active-button) {
  background-color: #e5e7eb; /* Equivalent to hover:bg-gray-200 */
}

.active-button {
  background-color: #4f46e5; 
  color: #ffffff;
  box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3); 
}

/* Component Area Styles */
.component-area {
  width: 100%; 
  
}
</style>

<style scoped>

</style>
