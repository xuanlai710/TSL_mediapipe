import os
import numpy as np
import json

input_dir = "data_npy"
labels = sorted(os.listdir(input_dir))
label_map = {label: idx for idx, label in enumerate(labels)}

output_X = "npy/x.npy"
output_y = "npy/y.npy"
output_labelmap = "npy/label_map.json"

x_data = []
y_data = []

for label in labels:
    label_path = os.path.join(input_dir, label)
    for file in os.listdir(label_path):
        if file.endswith(".npy"):
            seq = np.load(os.path.join(label_path, file))
            x_data.append(seq)#把影片所有資料放入array
            y_data.append(label_map[label])
# for i, sample in enumerate(x_data):
#     print(i, sample.shape)
x_data = np.array(x_data)
y_data = np.array(y_data)

np.save(output_X,x_data)
np.save(output_y,y_data)

with open(output_labelmap, "w", encoding="utf-8") as f:
    json.dump(label_map, f, ensure_ascii=False, indent=2)

print("X shape:", x_data.shape)
print("y shape:", y_data.shape)
print("label_map:", label_map)

# import os
# import numpy as np
# import json
# base_dir = "data_npy" 
# splits = ["train", "val", "test"]
# output_dir = "npy"

# # 建立標籤映射
# label_map = {}
# label_idx = 0

# for split in splits:
#     print(f"\n📂 處理 {split} 資料中...")
#     X, y = [], []
#     split_dir = os.path.join(base_dir, split)

#     if not os.path.exists(split_dir):
#         print(f"⚠️ 找不到 {split_dir}，略過")
#         continue

#     for label_name in sorted(os.listdir(split_dir)):
#         label_path = os.path.join(split_dir, label_name)
#         if not os.path.isdir(label_path):
#             continue

#         # 登記 label
#         if label_name not in label_map:
#             label_map[label_name] = label_idx
#             label_idx += 1
#         label_id = label_map[label_name]

#         # 讀取所有 .npy 檔案
#         for file in sorted(os.listdir(label_path)):
#             if file.endswith(".npy"):
#                 file_path = os.path.join(label_path, file)
#                 data = np.load(file_path)  # (frames, 126, 3)
#                 data = data.reshape(data.shape[0], -1)  # -> (frames, 378)
#                 X.append(data)
#                 y.append(label_id)

#     if not X:
#         print(f"⚠️ {split} 無資料，略過")
#         continue

#     # Padding 成固定長度（frame_len=30）
#     X = np.array(X)
#     y = np.array(y)

#     # 儲存
#     np.save( os.path.join(output_dir,f"{split}_X.npy"), X)
#     np.save(os.path.join(output_dir,f"{split}_y.npy"), y)

#     print(f"✅ {split} 完成！")
#     print("X shape:", X.shape)
#     print("y shape:", y.shape)

# # 儲存 label 對應表
# with open( os.path.join(output_dir,"label_map.json"), "w", encoding="utf-8") as f:
#     json.dump(label_map, f, ensure_ascii=False, indent=4)

# print("\n🎉 全部分割完成！")
# print("Label map:", label_map)
