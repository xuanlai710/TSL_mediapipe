import cv2
import mediapipe as mp
import os
import csv

video_folder = "video"  # 你的影片資料夾
output_csv = "video_segments.csv"

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5
)

with open(output_csv, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["video", "label", "fps", "start_frame", "end_frame", "start_sec", "end_sec", "detected"])

    for label in os.listdir(video_folder):#vidoes的子資料夾們
        label_path = os.path.join(video_folder, label)#videos/子資料夾
        if not os.path.isdir(label_path):
            continue

        for filename in os.listdir(label_path):#videos/子資料夾的子資料們
            if not filename.lower().endswith(('.mp4', '.avi', '.mov')):
                continue

            video_path = os.path.join(label_path, filename)
            cap = cv2.VideoCapture(video_path)

            if not cap.isOpened():
                print(f"❌ 開啟失敗: {video_path}")
                writer.writerow([filename, label, "N/A", -1, -1, -1, -1, "open_failed"])
                continue

            fps = cap.get(cv2.CAP_PROP_FPS)
            start_frame, end_frame = None, None
            frame_idx = 0
            detected = False

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = hands.process(image_rgb)

                if results.multi_hand_landmarks:
                    detected = True
                    if start_frame is None:
                        start_frame = frame_idx
                    end_frame = frame_idx

                frame_idx += 1

            cap.release()

            if detected:
                start_sec = start_frame / fps
                end_sec = end_frame / fps
                writer.writerow([filename, label, fps, start_frame, end_frame, f"{start_sec:.2f}", f"{end_sec:.2f}", "yes"])
                print(f"✅ 偵測到手: {filename}, {start_sec:.2f}s → {end_sec:.2f}s")
            else:
                writer.writerow([filename, label, fps, -1, -1, -1, -1, "no"])
                print(f"⚠️ 沒有偵測到手: {filename}")

print("🎉 已完成，輸出至", output_csv)
