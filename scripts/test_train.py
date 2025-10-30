import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, Masking
from tensorflow.keras.utils import to_categorical
from sklearn.metrics import confusion_matrix, ConfusionMatrixDisplay, classification_report
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt
import json
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
#from keras.layers import Conv1D

# --- 讀取資料 ---
X = np.load("npy/x.npy")  # (num_samples, 30, num_features)
y = np.load("npy/y.npy")  # (num_samples,)
with open("npy/label_map.json", "r", encoding="utf-8") as f:
    label_map = json.load(f)

num_classes = len(label_map)

# --- 先切 Test set (10%) ---
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.1, stratify=y, random_state=42
)

# --- 再切 Train/Val (從剩下的 90% 再切 20% 給 Val) ---
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.2, stratify=y_temp, random_state=42
)

y_train_cat = to_categorical(y_train, num_classes)
y_val_cat = to_categorical(y_val, num_classes)
y_test_cat = to_categorical(y_test, num_classes)

# --- 建立模型 ---
model = Sequential([

    # Conv1D(64, kernel_size=5, activation='relu', padding='same'),
    # Dropout(0.3),
    # LSTM(64, return_sequences=True),
    # Dropout(0.4),
    # LSTM(32),
    # Dense(32, activation='tanh'),
    # Dense(num_classes, activation='softmax')
    Masking(mask_value=0., input_shape=(X.shape[1], X.shape[2])),
    LSTM(32, return_sequences=True),#
    Dropout(0.5),
    LSTM(32),
    Dropout(0.5),
    Dense(32, activation='tanh'),#relu 目前結果都差不多
    Dense(num_classes, activation='softmax')
])

model.compile(optimizer='adam',
              loss='categorical_crossentropy',
              metrics=['accuracy'])


# --- EarlyStopping ---
early_stop = EarlyStopping(
    monitor="val_loss",      # 監控驗證集的 loss
    patience=5,              # 若 5 個 epoch 沒進步就停
    restore_best_weights=True # 回到最佳權重
)

# --- ModelCheckpoint (自動存最佳模型) ---
checkpoint = ModelCheckpoint(
    "best_sign_model.keras", # 最佳模型檔案名稱
    monitor="val_loss",      # 監控驗證集的 loss
    save_best_only=True,     # 只存最好的
    verbose=1
)

# --- 訓練 ---
history = model.fit(
    X_train, y_train_cat,
    validation_data=(X_val, y_val_cat),
    epochs=50,       # 可以設比較大，EarlyStopping會自動停
    batch_size=8,
    callbacks=[early_stop, checkpoint]  # 早停,自動存最佳模型
)

#CSVLogger，用來記錄訓練過程中，每一個週期的評估指標，並將其儲存成檔案

print("train finish, model saved!")


# --- 混淆矩陣 ---
def plot_cm(y_true, y_pred, title):
    cm = confusion_matrix(y_true, y_pred)
    disp = ConfusionMatrixDisplay(cm, display_labels=list(label_map.keys()))
    disp.plot(cmap="Blues", xticks_rotation=45)
    plt.title(title)
    plt.show()

# --- 預測 ---
y_train_pred = np.argmax(model.predict(X_train), axis=1)
y_val_pred = np.argmax(model.predict(X_val), axis=1)


plot_cm(y_train, y_train_pred, "Train Confusion Matrix")
plot_cm(y_val, y_val_pred, "Validation Confusion Matrix")

# --- 分類報告 (precision/recall/F1) ---
print("Train Report:\n", classification_report(y_train, y_train_pred, target_names=list(label_map.keys())))
print("Validation Report:\n", classification_report(y_val, y_val_pred, target_names=list(label_map.keys())))

# Test 評估 (最後的泛化能力檢查)
y_test_pred = np.argmax(model.predict(X_test), axis=1)
print("Test Report:\n", classification_report(y_test, y_test_pred, target_names=list(label_map.keys())))
plot_cm(y_test, y_test_pred, "Test Confusion Matrix")

# --- 準確率曲線 ---
fig_acc, ax_acc = plt.subplots()
ax_acc.plot(history.history['accuracy'], label='Train Acc')
ax_acc.plot(history.history['val_accuracy'], label='Val Acc')
ax_acc.set_xlabel('Epoch')
ax_acc.set_ylabel('Accuracy')
ax_acc.legend()
ax_acc.set_title('Accuracy Curve')

# --- 損失曲線 ---
fig_loss, ax_loss = plt.subplots()
ax_loss.plot(history.history['loss'], label='Train Loss')
ax_loss.plot(history.history['val_loss'], label='Val Loss')
ax_loss.set_xlabel('Epoch')
ax_loss.set_ylabel('Loss')
ax_loss.legend()
ax_loss.set_title('Loss Curve')

# --- 一次顯示所有圖 ---
plt.show()
