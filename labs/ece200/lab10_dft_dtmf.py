"""ECE 200 Lab 10: the DFT by hand, and touch-tone decoding

Background: DSP First Lab 09 (encoding and decoding touch-tone DTMF signals),
linked on the week 10 page. It uses MATLAB; this lab does the core ideas in Python.

How to work:
  1. Fill in each function marked TODO. Replace `return None` with your code.
  2. Check:   .venv\\Scripts\\python labs\\check.py 10
  3. Try it:  .venv\\Scripts\\python data\\labs\\lab10_dft_dtmf.py
my_dft must not call np.fft. In decode_key you MAY use np.fft.fft.
"""
import numpy as np

# Each key is the sum of one row tone and one column tone.
KEYPAD = [["1", "2", "3", "A"],
          ["4", "5", "6", "B"],
          ["7", "8", "9", "C"],
          ["*", "0", "#", "D"]]
ROW_FREQS = [697, 770, 852, 941]      # Hz, one per row of KEYPAD
COL_FREQS = [1209, 1336, 1477, 1633]  # Hz, one per column


# %% TODO 1: the DFT, by hand
def my_dft(x):
    """Return X[k] = sum_n x[n] e^(-j 2 pi k n / N) for k = 0 .. N-1.
    Hint: two loops, or build the N x N matrix W[k, n] = e^(-j 2 pi k n / N) and use W @ x.
    """
    return None  # TODO


# %% TODO 2: zero padding
def zero_pad(x, N):
    """Return x followed by zeros, total length N."""
    return None  # TODO


# %% TODO 3: make a touch-tone
def dtmf_tone(key, fs, n_samples):
    """Return cos(2 pi f_row n / fs) + cos(2 pi f_col n / fs), n = 0 .. n_samples-1,
    for the key's row and column in KEYPAD.
    Hint: loop over the rows to find the one containing key; then KEYPAD[row].index(key).
    """
    return None  # TODO


# %% TODO 4: decode one touch-tone
def decode_key(x, fs):
    """Return the key (a one-character string) whose tones are in x.

    Steps: X = np.abs(np.fft.fft(x)); N = len(x).
    For each row frequency f, look at X[round(f * N / fs)]; the biggest wins.
    Do the same for the column frequencies. Return KEYPAD[best_row][best_col].
    """
    return None  # TODO


# %% Try it
if __name__ == "__main__":
    x = np.random.randn(16)
    print("my_dft matches np.fft.fft:", np.allclose(my_dft(x), np.fft.fft(x)))
    fs = 8000
    number = "5417"
    print("decoded:", "".join(decode_key(dtmf_tone(k, fs, 2000), fs) for k in number), " sent:", number)
