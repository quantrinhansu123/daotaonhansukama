import json
import os
import re
from playwright.sync_api import sync_playwright

base = os.environ['TEST_APP_URL']
title = os.environ['TEST_LESSON_TITLE']
course = os.environ['TEST_COURSE_TITLE']
video_path = os.environ['TEST_VIDEO_PATH']
session_path = os.environ['TEST_SESSION_PATH']

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    try:
        page.goto(base, wait_until='domcontentloaded')
        page.locator('input[type="email"]').fill(os.environ['TEST_ADMIN_EMAIL'])
        page.locator('input[type="password"]').fill(os.environ['TEST_ADMIN_PASSWORD'])
        page.locator('form button[type="submit"]').click()
        page.wait_for_url(re.compile(r'/admin(?:$|\?)'), timeout=30000)
        print('Browser admin login: PASS', flush=True)

        page.goto(base + '/admin/courses', wait_until='domcontentloaded')
        row = page.locator('tr').filter(has_text=course).first
        row.wait_for(timeout=30000)
        row.locator('button').first.click()
        heading = page.get_by_role('heading', name=title, exact=True)
        heading.wait_for(timeout=30000)
        card = heading.locator('xpath=ancestor::div[contains(@class,"shadow-sm")][1]')
        file_input = card.locator('input[type="file"]').first
        with page.expect_response(lambda response: response.url.endswith('/api/cloudfly/video/multipart')
                                  and response.request.method == 'POST', timeout=30000) as started:
            file_input.set_input_files(video_path)
        session = started.value.json()
        if started.value.status != 200:
            raise RuntimeError(f'Multipart start returned {started.value.status}')
        with open(session_path, 'w', encoding='utf-8') as output:
            json.dump({'key': session['key'], 'uploadId': session['uploadId']}, output)
        ring = page.get_by_role('progressbar').first
        ring.wait_for(timeout=15000)
        print(f"Browser upload ring: {ring.get_attribute('aria-valuenow')}%", flush=True)

        page.locator('a[href="/student"]').first.click()
        page.wait_for_url(re.compile(r'/student(?:$|[?#])'), timeout=20000)
        ring = page.get_by_role('progressbar').first
        ring.wait_for(timeout=10000)
        print(f"Browser navigated while upload continued: {ring.get_attribute('aria-valuenow')}%", flush=True)
        page.get_by_text('Đã tải lên và lưu thành công.').wait_for(timeout=240000)
        complete = page.get_by_role('progressbar').first.get_attribute('aria-valuenow')
        if complete != '100':
            raise RuntimeError(f'Progress ring stopped at {complete}%')
        print('Browser progress ring: 100%, save complete', flush=True)

        page.locator('a[href="/admin/courses"]').first.click()
        page.wait_for_url(re.compile(r'/admin/courses'), timeout=20000)
        row = page.locator('tr').filter(has_text=course).first
        row.wait_for(timeout=30000)
        row.locator('button').first.click()
        heading = page.get_by_role('heading', name=title, exact=True)
        heading.wait_for(timeout=30000)
        card = heading.locator('xpath=ancestor::div[contains(@class,"shadow-sm")][1]')
        card.get_by_role('button', name='Xem').click()
        video = page.locator('video').last
        video.wait_for(timeout=20000)
        page.wait_for_function('''() => {
            const v = document.querySelector('video');
            return v && v.readyState >= 2 && Number.isFinite(v.duration);
        }''', timeout=30000)
        metadata = video.evaluate('(v) => ({duration: v.duration, width: v.videoWidth, height: v.videoHeight, readyState: v.readyState})')
        if metadata['width'] != 1280 or metadata['height'] != 720 or not (10 <= metadata['duration'] <= 14):
            raise RuntimeError(f'Unexpected browser video metadata: {metadata}')
        video.evaluate('(v) => { v.currentTime = Math.min(v.duration - 1, 5); }')
        page.wait_for_function('''() => {
            const v = document.querySelector('video');
            return v && !v.seeking && v.currentTime >= 4.5 && v.readyState >= 2;
        }''', timeout=30000)
        print(f"Browser playback and seek: PASS ({metadata['width']}x{metadata['height']}, {metadata['duration']:.1f}s)", flush=True)
    finally:
        browser.close()
