#flask api
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np

import json
with open("npy/label_map.json", "r", encoding="utf-8") as f:
    label_dict = json.load(f)
# 反轉字典，模型輸出是數字要找回文字
label_map = {v: k for k, v in label_dict.items()}

app = Flask(__name__)
CORS(app)#CORS(app, resources={r"/predict": {"origins": "*"}})

#模型啟用
model = tf.keras.models.load_model("best_sign_model.keras")

FRAME_LEN = 30



#函式
def normalize_hand(hand_landmark):
    '''相對座標'''
    normalize = []
    for lm in hand_landmark:
        if np.sum(lm) != 0:
            wrist = lm[0]#該幀第0項[x,y,z]
            hand_H = lm[9]
            scale = np.linalg.norm(hand_H-wrist)#歐式距離
            if scale < 1e-6:#=0
                scale = 1
            rel = (lm - wrist)/scale#所有-0點數值
        else:
            rel = lm
        normalize.append(rel.flatten())#變回(63,) 加入幀列後方

    arr = np.array(normalize)#保證回傳為array格式
    return arr

def normalize_length(seq, target_len=30):
    '''調整序列固定長度'''
    n_frame = len(seq)
    if n_frame == 0:
        return np.zeros((target_len, seq.shape[1]))
    if n_frame == 30:
        return seq
     # 短,補零
    if n_frame < target_len:
        pad = np.zeros((target_len - n_frame, seq.shape[1]))
        return np.vstack([seq, pad])
    # 長,均勻取樣
    if n_frame > target_len:
        idx = np.round(np.linspace(0, n_frame-1, target_len)).astype(int)
        return seq[idx]

def calc_displacement(seq, mode):
    '''位移'''
    if mode == "frame":
        disp = np.diff(seq, axis=0)#沿frame計算差值(這裡會沒有第一行)
        disp = np.vstack([np.zeros((1, seq.shape[1])), disp])#vstack縱向堆疊
    elif mode == "first":
        disp = seq - seq[0]
    else:
        raise ValueError("mode must be 'frame' or 'first'")
    return disp

@app.route('/predict',methods=["POST"])
def predict():
    #前端回傳值
    data = request.get_json()
    #------------------
    #   回傳格式不確定
    #先暫定回傳分為左右手，len_frame幀* (21*3)
    #[[(第一幀)[x0 y0 z0],[x1 y1 z1], ... ,[x20 y20 z20]][...]...[len_frame幀...]]
    #json {名 : 值}
    #-------------------------------------
    lefthand = np.array(data['left'])  #要np格式
    righthand = np.array(data['right'])
    #絕對座標
    both_hand = np.concatenate([lefthand.reshape(-1, 63), righthand.reshape(-1, 63)], axis=1)
    both_hand_nlength = normalize_length(both_hand, FRAME_LEN)
    #相對座標
    left_rel = normalize_hand(both_hand_nlength[:, :63].reshape(-1, 21, 3))
    right_rel = normalize_hand(both_hand_nlength[:, 63:].reshape(-1, 21, 3))
    both_rel = np.concatenate([left_rel, right_rel], axis=1)
    # 算位移
    disp_frame = calc_displacement(both_hand_nlength,mode = "frame")
    disp_first = calc_displacement(both_hand_nlength, mode="first")

    X_combined = np.concatenate([both_rel, disp_frame, disp_first], axis=1)
    X_combined = np.expand_dims(X_combined, axis=0)  # (1, frame_len, features)??

   # === 模型預測 ===
    pred = model.predict(X_combined)
    pred_label = int(np.argmax(pred))
    confidence = float(np.max(pred))

    # === 閾值與平滑控制（可調整） ===
    CONF_THRESHOLD = 0.6
    result = {
        "label": label_map.get(pred_label, "unknown") if confidence > CONF_THRESHOLD else "unknown",
        "confidence": confidence
    }

    return jsonify(result)

# === 主程式 ===
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
 