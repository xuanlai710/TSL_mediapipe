import cv2
import mediapipe as mp
import os
import csv

import numpy as np
import pandas as pd

#----------
#------------------------------

# 輸入資料夾路徑---------------------------------------------
video = "video"       # 影片在這個資料夾下
output_folder = "data"
npy_output_folder = "data_npy"
#-----------------------------------------------------
#之後可變化數值-----------
frame_len = 30
#--------------------------

# 如果輸出資料夾不存在，先建立
os.makedirs(output_folder, exist_ok=True)
os.makedirs(npy_output_folder, exist_ok=True)


#函式---------------------------------------------------------------------------------
'''相對座標'''
def normalize_hand(hand_landmark):
    normalize = []#list
    for lm in hand_landmark:#lm是每幀的數據(裡面有21*3的數據)
        if np.sum(lm) != 0:#該幀全為0時，不用算
            wrist = lm[0]#該幀第0項[x,y,z]
            hand_H = lm[9]
            scale = np.linalg.norm(hand_H-wrist)
            if scale < 1e-6:#=0
                scale = 1
            rel = (lm - wrist)/scale#所有-0點數值
        else:
            rel = lm
        normalize.append(rel.flatten())#變回(63,)

    #arr = np.array(normalize)
    arr = np.array(normalize, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr[np.newaxis, :]  # 變成 (1, 63)
    return arr



'''調整序列固定長度'''
def normalize_length(seq, target_len=30):
    n_frames = len(seq)

    # 0 幀,全補零
    if n_frames == 0:
        return np.zeros((target_len, seq.shape[1]))

    # 剛好
    if n_frames == target_len:
        return seq

    # 短,補零
    if n_frames < target_len:
        pad = np.zeros((target_len - n_frames, seq.shape[1]))
        return np.vstack([seq, pad])

    # 長,均勻取樣
    if n_frames > target_len:
        idx = np.round(np.linspace(0, n_frames-1, target_len)).astype(int)
        return seq[idx]

'''位移'''
def calc_displacement(seq, mode):
    if mode == "frame":
        disp = np.diff(seq, axis=0)#沿frame計算差值(這裡會沒有第一行)
        disp = np.vstack([np.zeros((1, seq.shape[1])), disp])#vstack縱向堆疊
    elif mode == "first":
        disp = seq - seq[0]
    else:
        raise ValueError("mode must be 'frame' or 'first'")
    return disp

'''時間序列做增強（拉伸或壓縮）'''
def time_warp(seq, target_len=30, min_scale=0.8, max_scale=1.2):
    # seq: (frame_len, feature_dim)
    # min_scale, max_scale: 縮放比例範圍
    scale = np.random.uniform(min_scale, max_scale)
    new_len = int(len(seq) * scale)

    # 均勻重取樣
    idx = np.round(np.linspace(0, len(seq)-1, new_len)).astype(int)
    seq_scaled = seq[idx]
    seq_scaled = normalize_length(seq_scaled,target_len)#'''
    return np.array(seq_scaled)

def random_frame_dropout(seq, drop_prob=0.1, target_len=30, min_keep_ratio=0.3):
    """
    隨機丟掉一些 frame，「隨機缺失」的增強
    min_keep_ratio: 至少保留的比例，避免只剩太少幀
    """
    keep_idx = [i for i in range(len(seq)) if np.random.rand() > drop_prob]

    # 保底至少保留一定比例的幀數
    min_keep = max(1, int(len(seq) * min_keep_ratio))
    if len(keep_idx) < min_keep:
        keep_idx = np.linspace(0, len(seq)-1, min_keep).astype(int)

    seq_dropped = seq[keep_idx]
    return np.array(normalize_length(seq_dropped, target_len))

'''鏡射'''
def mirror_landmarks(seq):
    '''seq = both_rel_fix + disp_frame + disp_first 
    做鏡射，x軸會變-x(v)
    再將左右手欄位交換(忘記做)
    '''
    seq_mirror = seq.copy()#用seq會直接改變傳入的seq
    seq_mirror[:,0::3] *= -1#所有的x軸都要翻

    # block_size = 126
    # half = 63
    # n_blocks = seq_mirror.shape[1] // block_size  # 這裡應該是 3
    for b in range(3):
        s = b * 126
        left = seq_mirror[:, s:s+63].copy()
        right = seq_mirror[:, s+63:s+126].copy()
        seq_mirror[:, s:s+63] = right
        seq_mirror[:, s+63:s+126] = left

    return seq_mirror
#------------------------------------------------------------------------------------

#   建立 CSV 標題列
header = ['frame_idx']
for hand in ['left', 'right']:
    for i in range(21):  
        header += [f'{hand}_x{i}', f'{hand}_y{i}', f'{hand}_z{i}']

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

#  遍歷所有子資料夾（每個資料夾一個手語動作）
for label in os.listdir(video): #(1)os.listdir用于返回指定的文件夹(video)包含的文件或文件夹的名字的列表
    label_path = os.path.join(video, label)#(2)連接一個或多個路徑段 videos/裡面的資料夾
    if not os.path.isdir(label_path):#os.path.isdir(path)如果 path 是一個已存在的目錄，則回傳 True
        continue

    #輸出資料夾內更具手語單字增加子資料夾，label_name(指手語單字)
    label_name = os.path.join(output_folder,label)  
    label_name_npy = os.path.join(npy_output_folder,label)
    os.makedirs(label_name, exist_ok=True)  #例:data/hello
    os.makedirs(label_name_npy, exist_ok=True)

    for filename in os.listdir(label_path):#(1) videos/裡面的資料夾 裡面的檔案
        if not filename.endswith(('.mp4', '.avi', '.mov','png')):#用于判断字符串是否以指定后缀结尾
            continue

        #輸出CSV檔名用影片名
        output_csv = os.path.join(label_name,os.path.splitext(filename)[0] + ".csv")
        output_npy = os.path.join(label_name_npy,os.path.splitext(filename)[0] + ".npy")
        
        if not os.path.exists(output_csv): #若之前已經跑過了就跳過  
            # print(f"skip: {filename}")
            # continue 
       
            print(f'use: {filename}')

            is_image = os.path.splitext(filename)[1].lower() in ['.jpg', '.jpeg', '.png']
            #   MediaPipe 初始化
            hands = mp_hands.Hands(
                static_image_mode = is_image,#若是照片會變true
                max_num_hands=2, )# min_detection_confidence=0.7
        
            video_path = os.path.join(label_path, filename)#(2)videos/裡面的資料夾/裡面的檔案
            
                #-------------------------影片
            if not is_image:
                #開始寫CSV
                with open(output_csv, mode='w', newline='') as f: #newline='':是為了讓資料中包含的換行字元可以正確被解析
                    writer = csv.writer(f)# 建立 CSV 檔寫入器
                    writer.writerow(header)#寫入一列資料

                    cap = cv2.VideoCapture(video_path)#連接鏡頭(我這裡是連影片)
                    
                    frame_idx = 0
                    while cap.isOpened():
                        #第一個值為True或False，表示順利讀取或讀取錯誤，第二個值表示讀取到影片某一幀的畫面
                        ret, frame = cap.read()
                        if not ret:#影片結束
                            break

                        frame_idx += 1

                        # BGR轉換成RGB
                        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        results = hands.process(image_rgb)
                        
                        #預設做右手為0
                        lefthand = [[0,0,0]]*21
                        righthand = [[0,0,0]]*21

                        if results.multi_hand_landmarks and results.multi_handedness:
                            for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
                                handed_label = handedness.classification[0].label  # "Left" / "Right"
                                #儲存的是絕對座標
                                coords = [[lm.x,lm.y,lm.z] for lm in hand_landmarks.landmark]
                                if handed_label == "Left":
                                    lefthand = coords
                                else:
                                    righthand = coords
                        else:
                            continue

                        #組合row
                        row = [frame_idx]
                        for lm in lefthand:
                            row.extend(lm)
                        for lm in righthand:
                            row.extend(lm)
                        writer.writerow(row)#寫入
                    cap.release() 

            #------------------------------------照片
            elif is_image:

                image = cv2.imread(video_path)
                image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                results = hands.process(image_rgb)

                if not results.multi_hand_landmarks or not results.multi_handedness:
                    print(f"⚠️  {filename} 無法偵測到手部，略過")
                    continue  # 跳過這張圖片

                lefthand = [[0,0,0]]*21
                righthand = [[0,0,0]]*21

                if results.multi_hand_landmarks and results.multi_handedness:
                    for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
                        handed_label = handedness.classification[0].label  # "Left" / "Right"
                        #絕對座標
                        coords = [[lm.x,lm.y,lm.z] for lm in hand_landmarks.landmark]
                        if handed_label == "Left":
                            lefthand = coords
                        else:
                            righthand = coords

                with open(output_csv, mode='w', newline='') as f: 
                    writer = csv.writer(f)# 建立 CSV 檔寫入器
                    writer.writerow(header)#寫入一列資料
                    frame_idx = 1
                    for i in range(frame_len):
                        row = [frame_idx]
                        frame_idx += 1
                        for lm in lefthand:
                            row.extend(lm)
                        for lm in righthand:
                            row.extend(lm)
                        writer.writerow(row)#寫入

            
        #讀出絕對座標
        df = pd.read_csv(output_csv)
        left_hand = df.iloc[:,1:64].to_numpy()#all row的1-63col
        right_hand = df.iloc[:,64:].to_numpy()#64-最後 col
        both_hand = np.concatenate([left_hand, right_hand], axis=1)
        both_hand_nlength = np.array(normalize_length(both_hand,frame_len))#絕對座標雙手np

        #處理相對座標並轉成npy儲存------
        print(both_hand_nlength.shape[1])
        left_rel = normalize_hand(both_hand_nlength[:, :63].reshape(-1, 21, 3))
        right_rel = normalize_hand(both_hand_nlength[:, 63:].reshape(-1, 21, 3))
        both_rel = np.concatenate([left_rel, right_rel], axis=1)#完整相對座標
        # print(output_csv)
        #處理絕對位移
        
        # displacement 特徵
        disp_frame = calc_displacement(both_hand_nlength, mode="frame")
        disp_first = calc_displacement(both_hand_nlength, mode="first")
        #若要減少節點數，可以把輸入改成選擇過節點後的both_hand_fix做輸入-----------------

        X_combined = np.concatenate([both_rel, disp_frame, disp_first], axis=1)

        # 存檔
        np.save(output_npy, X_combined)#綜合擺放中
        seq_mirror = mirror_landmarks(X_combined)
        np.save(output_npy.replace(".npy", "_mirror.npy"), seq_mirror)

        # 存時間拉伸
        seq_time = time_warp(X_combined, frame_len)
        np.save(output_npy.replace(".npy", "_timewarp.npy"), seq_time)

        # 存隨機丟幀
        seq_dropout = random_frame_dropout(X_combined, drop_prob=0.15, target_len=frame_len)
        np.save(output_npy.replace(".npy", "_drop.npy"), seq_dropout)
print("finish")
