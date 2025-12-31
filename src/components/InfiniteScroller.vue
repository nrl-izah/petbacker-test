<script setup lang="ts">

/*
  Infinite Scroller (Vue 3 + Composition API)
  - Loads initial content from API
  - Preloads next page when user scrolls past 50%
  - Loads more when bottom sentinel enters view
  - Uses tag-based pagination as required by API
*/

import { ref, onMounted, onUnmounted, watch } from 'vue';
import axios from 'axios';

/* --------------------------------------------------------------------------
   Types
-------------------------------------------------------------------------- */
interface MediaItem {
  media_filename: string;
}

interface ContentItem {
  title: string;
  description: string;
  medias?: MediaItem[];
}

/* --------------------------------------------------------------------------
   Reactive State
-------------------------------------------------------------------------- */
const content = ref<ContentItem[]>([]);
const nextTag = ref<string | null>(null);
const isLoading = ref<boolean>(false);
const sentinelRef = ref<HTMLElement | null>(null);

let observer: IntersectionObserver | null = null; 

/* --------------------------------------------------------------------------
   Fetch Content from API
   - Uses 'tag' parameter for pagination
   - Appends results to content[]
-------------------------------------------------------------------------- */
const loadContent = async () => {
  if (isLoading.value || nextTag.value === "") return;

  isLoading.value = true;
  console.log("[loadContent] Fetching data...");

  const params: Record<string, any> = {
    refresh: 1,
    type: 0,
    auth: 0,
    per_page: 8,
  };

  // Add tag only for subsequent pages
  if (nextTag.value) params.tag = nextTag.value;

  try {
    const response = await axios.get(
      "https://pbapi.forwen.com/v5/moments",
      { params }
    );

    const newItems: ContentItem[] = response.data || [];
    console.log(`[loadContent] Received ${newItems.length} items`);

    if (newItems.length > 0) {
      content.value.push(...newItems);
      nextTag.value = response.headers["tag"] || null; // Next page token
    } else {
      nextTag.value = null; // End of content
      console.log("[loadContent] No more content available.");
    }
    console.log("[loadContent] Total content items:", content.value.length);
  } catch (err) {
    console.error("[loadContent] Error fetching content:", err);
  } finally {
    isLoading.value = false;
  }
};

/* --------------------------------------------------------------------------
   Midway Preload Trigger
   - When user scrolls past 50% of page height
-------------------------------------------------------------------------- */
const handleScroll = () => {
  if (isLoading.value || nextTag.value === null) return;

  const scrollTop = window.scrollY;
  const viewportHeight = window.innerHeight;
  const fullHeight = document.body.scrollHeight;

  const scrolledRatio = (scrollTop + viewportHeight) / fullHeight;

  // Start preloading before user reaches end of content
  if (scrolledRatio >= 0.5) {
    console.log("[scroll] Midway preload triggered");
    loadContent();
  }
};

/* --------------------------------------------------------------------------
   Sentinel Observer (Bottom Trigger)
   - Loads more items when sentinel enters viewport
-------------------------------------------------------------------------- */
watch(sentinelRef, (el) => {
  if (!el) return;

  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries[0]?.isIntersecting;
      if (visible && !isLoading.value && nextTag.value !== null) {
        console.log("[observer] Sentinel triggered load");
        loadContent();
      }
    },
    { rootMargin: "0px 0px 1000px 0px", threshold: 0.1 }
  );

  observer.observe(el);
});

/* --------------------------------------------------------------------------
   Lifecycle Hooks
-------------------------------------------------------------------------- */
onMounted(() => {
  loadContent();
  window.addEventListener("scroll", handleScroll);
});

onUnmounted(() => {
  if (observer) observer.disconnect();
  window.removeEventListener("scroll", handleScroll);
});


</script>

<template>
  <div class="infinite-scroller">
    
    <div v-for="(item, index) in content" :key="index" class="content-card">
      <h2>{{ item.title }}</h2>
      <p>{{ item.description }}</p>
      
      <img 
        v-if="item.medias && item.medias.length > 0 && item.medias[0]?.media_filename" 
        :src="item.medias[0]?.media_filename" 
        :alt="item.title"
        class="content-photo"
      >
      
    </div>
    
    <div 
        v-if="nextTag !== null"
        ref="sentinelRef" 
        class="sentinel"
    ></div>

    <div class="status-indicator">
      <p v-if="isLoading">
        <span class="spinner"></span> Loading more content...
      </p>
      <p v-else-if="!nextTag && content.length > 0">
        You've reached the end of the line!
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Mobile View */

.infinite-scroller {
  width: 100%;
  /* padding: 20px;  */
  font-family: Arial, sans-serif;
  background-color: #f8f8f8;
  box-sizing: border-box; 
}

.content-card {
  background-color: #ffffff;
  border-radius: 12px;
  margin-bottom: 20px; 
  padding: 24px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  overflow: hidden; 
  text-align: left;
}

.content-card h2 {
  font-size: 1.5em; 
  color: #333;
  margin-top: 0;
  margin-bottom: 5px;
}

.content-card p {
  font-size: 0.85em; 
  color: #666;
  margin-bottom: 15px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.content-photo {
  width: 100%;
  height: 25vh; 
  min-height: 200px; 
  object-fit: cover; 
  border-radius: 8px;
  display: block;
}

@media (min-width: 600px) {
  .infinite-scroller {
    width: 100%; 
    margin: 0 auto; 
    padding: 20px;
  }
  
  .content-card h2 {
    font-size: 1.2em; 
  }

  .content-card p {
    font-size: 0.9em; 
  }

  .content-photo {
    height: 300px; 
  }
}

.status-indicator {
  text-align: center;
  padding: 20px;
  font-style: italic;
  color: #888;
}

.spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 3px solid #ccc;
    border-top-color: #333;
    border-radius: 50%;
    animation: spin 1s infinite linear;
    vertical-align: middle;
    margin-right: 5px;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.sentinel {
    height: 50px; 
    visibility: hidden;
}

</style>
