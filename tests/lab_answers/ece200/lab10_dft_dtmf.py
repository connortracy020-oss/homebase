"""SPOILERS: worked answers, used only by tests/test_labs.py to prove the checker
passes a correct, hand-written solution. Try the lab yourself first."""
import numpy as np

KEYPAD = [["1", "2", "3", "A"], ["4", "5", "6", "B"], ["7", "8", "9", "C"], ["*", "0", "#", "D"]]
ROW_FREQS = [697, 770, 852, 941]
COL_FREQS = [1209, 1336, 1477, 1633]


def my_dft(x):
    N = len(x)
    n = np.arange(N)
    W = np.exp(-2j * np.pi * np.outer(n, n) / N)
    return W @ x


def zero_pad(x, N):
    return np.concatenate([x, np.zeros(N - len(x))])


def dtmf_tone(key, fs, n_samples):
    for row in range(4):
        if key in KEYPAD[row]:
            col = KEYPAD[row].index(key)
            n = np.arange(n_samples)
            return np.cos(2 * np.pi * ROW_FREQS[row] * n / fs) + np.cos(2 * np.pi * COL_FREQS[col] * n / fs)


def decode_key(x, fs):
    X = np.abs(np.fft.fft(x))
    N = len(x)
    rows = [X[round(f * N / fs)] for f in ROW_FREQS]
    cols = [X[round(f * N / fs)] for f in COL_FREQS]
    return KEYPAD[int(np.argmax(rows))][int(np.argmax(cols))]
