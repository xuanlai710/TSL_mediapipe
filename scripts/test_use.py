import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
from collections import deque

# ----------------------
frame_len = 30  # 與模型訓練相同
smooth_window = 5  # 預測平滑窗口
threshold = 0.5  # 顯示信心值門檻
classes = ["dad","getup","goodmoring","happy","like","mom","older brother","older sister"
           ,"play","sign language","sorry","study","thanks","together","younger brother","younger sister"]
# ----------------------

model = tf.keras.models.load_model("model/10.29_model.keras")

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5
)
mp_drawing = mp.solutions.drawing_utils

# ----------------------
def normalize_hand(hand_landmark):
    normalize = []
    for lm in hand_landmark:
        if np.sum(lm) != 0:
            wrist = lm[0]
            hand_H = lm[9]
            scale = np.linalg.norm(hand_H - wrist)
            if scale < 1e-6:
                scale = 1
            rel = (lm - wrist) / scale
        else:
            rel = lm
        normalize.append(rel.flatten())
    return np.array(normalize)

def normalize_length(seq, target_len=30):
    n_frames = len(seq)
    if n_frames == 0:
        return np.zeros((target_len, seq.shape[1]))
    if n_frames == target_len:
        return seq
    if n_frames < target_len:
        pad = np.zeros((target_len - n_frames, seq.shape[1]))
        return np.vstack([seq, pad])
    idx = np.round(np.linspace(0, n_frames-1, target_len)).astype(int)
    return seq[idx]

def calc_displacement(seq, mode):
    if mode == "frame":
        disp = np.diff(seq, axis=0)
        disp = np.vstack([np.zeros((1, seq.shape[1])), disp])
    elif mode == "first":
        disp = seq - seq[0]
    else:
        raise ValueError("mode must be 'frame' or 'first'")
    return disp

def process_frame(left_hand, right_hand, frame_len=30):
    left_hand = left_hand.reshape(-1, 63)
    right_hand = right_hand.reshape(-1, 63)
    both_hand = np.concatenate([left_hand, right_hand], axis=1)
    both_hand_fix = normalize_length(both_hand, frame_len)

    left_rel = normalize_hand(left_hand.reshape(-1,21,3))
    right_rel = normalize_hand(right_hand.reshape(-1,21,3))
    both_rel = np.concatenate([left_rel, right_rel], axis=1)
    both_rel_fix = normalize_length(both_rel, frame_len)

    disp_frame = calc_displacement(both_hand_fix, mode="frame")
    disp_first = calc_displacement(both_hand_fix, mode="first")

    X_combined = np.concatenate([both_rel_fix, disp_frame, disp_first], axis=1)
    return X_combined
# ----------------------

frame_buffer = deque(maxlen=frame_len)
pred_buffer = deque(maxlen=smooth_window)

cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)#1 代表 左右翻轉。0 代表上下翻轉，-1 代表同時上下＋左右翻轉。
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(image_rgb)

    # 畫骨架
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                mp_drawing.DrawingSpec(color=(0,255,0), thickness=2, circle_radius=3),
                mp_drawing.DrawingSpec(color=(0,0,255), thickness=2)
            )

    lefthand = [[0,0,0]]*21
    righthand = [[0,0,0]]*21

    if results.multi_hand_landmarks and results.multi_handedness:
        for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
            coords = [[lm.x,lm.y,lm.z] for lm in hand_landmarks.landmark]
            if handedness.classification[0].label == "Left":
                lefthand = coords
            else:
                righthand = coords

    frame_buffer.append((lefthand, righthand))

    #if len(frame_buffer) == frame_len:
    lefts, rights = zip(*frame_buffer)
    X_input = process_frame(np.array(lefts), np.array(rights))
    X_input = np.expand_dims(X_input, axis=0)
    y_pred = model.predict(X_input, verbose=0)

    # 加入平滑信心值
    pred_buffer.append(y_pred[0])
    smooth_conf = np.mean(np.array(pred_buffer), axis=0)

    for i, conf in enumerate(smooth_conf):
        if conf > threshold:
            color = (0, 255, 255)  # 黃色，高信心
        #else:
        #    color = (150, 150, 150)  # 灰色，低信心
            text = f"{classes[i]} ({conf:.2f})"
            cv2.putText(frame, text, (30, 50 + i*30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
    # display_texts = []
    # for i, conf in enumerate(smooth_conf):
    #     if conf > threshold:
    #         display_texts.append(f"{classes[i]} ({conf:.2f})")

    # for idx, text in enumerate(display_texts):
    #     cv2.putText(frame, text, (30, 50 + idx*30),
    #                 cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,255), 2)

    cv2.imshow("Sign Recognition", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

#建議
# 前端按開始 → 錄影 2~3 秒 → 後端傳給模型一次性預測 → 回傳結果 → 顯示 ✅ 或 ❌
