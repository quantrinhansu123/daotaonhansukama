import os
import re
from playwright.sync_api import sync_playwright

base = os.environ['TEST_APP_URL']
course_id = os.environ['TEST_COURSE_ID']
title = os.environ['TEST_LESSON_TITLE']

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    try:
        page.goto(base, wait_until='domcontentloaded')
        page.locator('input[type="email"]').fill(os.environ['TEST_STAFF_EMAIL'])
        page.locator('input[type="password"]').fill(os.environ['TEST_STAFF_PASSWORD'])
        page.locator('form button[type="submit"]').click()
        page.wait_for_url(re.compile(r'/admin(?:$|\?)'), timeout=30000)
        page.goto(base + '/student/courses/' + course_id, wait_until='domcontentloaded')
        lesson = page.get_by_role('button', name=re.compile(re.escape(title))).first
        lesson.wait_for(timeout=30000)
        lesson.click()
        video = page.locator('video').first
        video.wait_for(timeout=20000)
        page.wait_for_function('''() => {
            const v = document.querySelector('video');
            return v && v.readyState >= 2 && Number.isFinite(v.duration);
        }''', timeout=30000)
        metadata = video.evaluate('(v) => ({duration: v.duration, width: v.videoWidth, height: v.videoHeight})')
        if metadata['width'] != 1280 or metadata['height'] != 720 or not (10 <= metadata['duration'] <= 14):
            raise RuntimeError(f'Unexpected staff video metadata: {metadata}')
        video.evaluate('(v) => { v.currentTime = 5; }')
        page.wait_for_function('''() => {
            const v = document.querySelector('video');
            return v && !v.seeking && v.currentTime >= 4.5 && v.readyState >= 2;
        }''', timeout=30000)
        print(f"Staff course player: PASS ({metadata['width']}x{metadata['height']}, {metadata['duration']:.1f}s, seek)", flush=True)
    finally:
        browser.close()
