"""Auto-checks for the ten ECE 200 Python labs.

Each check takes `m`, your lab file loaded as a module, calls one of your
functions with test inputs, and compares the answer with NumPy/SciPy:
  ask(m, "name", args...)  calls your function (and notices if it's still a TODO)
  same(got, want, what)    numbers/arrays must match (to about 1e-8)
  same_value(got, want)    must be exactly equal (True/False, a key name)
  by_hand(m, "name", [...]) fails if your function calls a built-in that does the work

The test inputs come from a fixed random seed, so a run is repeatable.
CHECKS at the bottom maps lab number -> list of (what is checked, check function).
"""
import numpy as np
from scipy import signal

from app.labs import Wrong, ask, by_hand, same, same_value

DO_IT_YOURSELF = ["convolve", "lfilter", "correlate", "fftconvolve", "filtfilt", "oaconvolve"]
NO_FFT = ["fft", "ifft", "rfft", "irfft", "freqz", "fftn"]


def rng(seed):
    return np.random.default_rng(seed)


# ---- Lab 1: sinusoids and phasors ---------------------------------------------------

def lab01_make_cosine(m):
    t = np.linspace(0, 0.01, 200)
    for A, f, phi in [(1.0, 100.0, 0.0), (2.5, 440.0, -np.pi / 3), (0.7, 1234.0, 2.0)]:
        same(ask(m, "make_cosine", A, f, phi, t), A * np.cos(2 * np.pi * f * t + phi),
             f"make_cosine({A}, {f}, {phi:.3f}, t)")


def lab01_phasor(m):
    for A, phi in [(1.0, 0.0), (3.0, np.pi / 4), (2.0, -2.5)]:
        same(ask(m, "phasor", A, phi), A * np.exp(1j * phi), f"phasor({A}, {phi:.3f})")


def lab01_add_phasors(m):
    r = rng(1)
    amps, phases = r.uniform(0.5, 3, 3), r.uniform(-np.pi, np.pi, 3)
    A, phi = ask(m, "add_phasors", amps, phases)
    total = np.sum(amps * np.exp(1j * phases))
    same(A, abs(total), "the amplitude A")
    same(np.exp(1j * phi), np.exp(1j * np.angle(total)), "the phase phi")  # same angle, even if +-2pi apart


def lab01_sum_of_cosines(m):
    r = rng(2)
    amps, phases = r.uniform(0.5, 3, 3), r.uniform(-np.pi, np.pi, 3)
    t = np.linspace(0, 0.02, 300)
    want = sum(a * np.cos(2 * np.pi * 50 * t + p) for a, p in zip(amps, phases))
    same(ask(m, "sum_of_cosines", amps, phases, 50.0, t), want, "sum_of_cosines")


def lab01_phasor_rule(m):
    r = rng(3)
    amps, phases = r.uniform(0.5, 3, 3), r.uniform(-np.pi, np.pi, 3)
    t = np.linspace(0, 0.02, 300)
    A, phi = ask(m, "add_phasors", amps, phases)
    same(ask(m, "sum_of_cosines", amps, phases, 50.0, t), A * np.cos(2 * np.pi * 50 * t + phi),
         "the numeric sum compared with the one cosine from your phasor sum")


# ---- Lab 2: spectrum and synthesis --------------------------------------------------

def lab02_synthesize(m):
    t = np.arange(0, 0.05, 1 / 8000)
    amps, freqs, phases = [1.0, 0.5, 2.0], [100.0, 250.0, 400.0], [0.0, np.pi / 2, -1.0]
    want = sum(a * np.cos(2 * np.pi * f * t + p) for a, f, p in zip(amps, freqs, phases))
    same(ask(m, "synthesize", amps, freqs, phases, t), want, "synthesize")


def lab02_spectrum(m):
    amps, freqs, phases = [2.0, 0.5], [100.0, 300.0], [np.pi / 3, -1.0]
    got = ask(m, "two_sided_spectrum", amps, freqs, phases)
    want = {}
    for a, f, p in zip(amps, freqs, phases):
        want[f] = a / 2 * np.exp(1j * p)
        want[-f] = a / 2 * np.exp(-1j * p)
    if sorted(got) != sorted(want):
        raise Wrong(f"spectrum lines are at {sorted(got)}, expected {sorted(want)}")
    for f in want:
        same(got[f], want[f], f"the complex amplitude at {f} Hz")


def lab02_line_amplitude(m):
    fs, N = 8000, 8000  # one second: every frequency in whole Hz is exactly one FFT bin
    n = np.arange(N)
    x = 3 * np.cos(2 * np.pi * 200 * n / fs + 0.4) + 1.2 * np.cos(2 * np.pi * 700 * n / fs)
    X = np.fft.fft(x)
    for f, A in [(200, 3.0), (700, 1.2), (500, 0.0)]:
        got = ask(m, "line_amplitude", x, fs, f)
        same(got, abs(X[f]) / N, f"line_amplitude at {f} Hz")
        same(got, A / 2, f"line_amplitude at {f} Hz (should be A/2)", tol=1e-6)


# ---- Lab 3: sampling and aliasing ---------------------------------------------------

def lab03_sample_cosine(m):
    n = np.arange(50)
    same(ask(m, "sample_cosine", 300.0, 2000.0, 50, 0.5), np.cos(2 * np.pi * 300 * n / 2000 + 0.5),
         "sample_cosine(300, 2000, 50, 0.5)")


def lab03_alias_frequency(m):
    fs = 1000
    for f in [100, 400, 600, 900, 1100, 1700, 2300, 3999]:
        same(ask(m, "alias_frequency", f, fs), abs(f - fs * round(f / fs)), f"alias_frequency({f}, {fs})")


def lab03_fft_peak(m):
    fs, N = 1000, 1000
    n = np.arange(N)
    for f in [120, 380, 640, 1270]:
        x = np.cos(2 * np.pi * f * n / fs)
        X = np.abs(np.fft.fft(x))[: N // 2 + 1]
        same(ask(m, "fft_peak_frequency", x, fs), np.argmax(X) * fs / N, f"fft_peak_frequency for {f} Hz")


def lab03_prediction_matches_fft(m):
    fs = 1000
    for f in [380, 640, 1270, 2210]:
        x = ask(m, "sample_cosine", f, fs, 1000, 0.0)
        same(ask(m, "fft_peak_frequency", x, fs), ask(m, "alias_frequency", f, fs),
             f"your FFT peak vs your predicted alias for {f} Hz")


def lab03_sinc_reconstruct(m):
    fs = 100
    x = np.cos(2 * np.pi * 7 * np.arange(60) / fs)
    t = np.linspace(0.1, 0.5, 77)
    n = np.arange(len(x))
    want = np.array([np.sum(x * np.sinc(fs * ti - n)) for ti in t])
    same(ask(m, "sinc_reconstruct", x, fs, t), want, "sinc_reconstruct")


# ---- Lab 4: FIR filters by hand -----------------------------------------------------

def lab04_impulse_step(m):
    same(ask(m, "impulse", 6), [1, 0, 0, 0, 0, 0], "impulse(6)")
    same(ask(m, "unit_step", 6), [1, 1, 1, 1, 1, 1], "unit_step(6)")


def lab04_my_fir_convolve(m):
    r = rng(4)
    x, b = r.normal(size=40), r.normal(size=5)
    same(ask(m, "my_fir", x, b), np.convolve(x, b)[: len(x)], "my_fir(x, b)")
    by_hand(m, "my_fir", DO_IT_YOURSELF)


def lab04_my_fir_lfilter(m):
    r = rng(5)
    x, b = r.normal(size=25), r.normal(size=8)
    same(ask(m, "my_fir", x, b), signal.lfilter(b, 1, x), "my_fir vs scipy.signal.lfilter(b, 1, x)")


def lab04_impulse_response(m):
    b = np.array([0.5, -1.0, 2.0, 0.25])
    want = np.concatenate([b, np.zeros(6)])
    same(ask(m, "my_fir", ask(m, "impulse", 10), b), want, "my_fir(impulse(10), b)")


def lab04_running_average(m):
    same(ask(m, "running_average", 4), np.ones(4) / 4, "running_average(4)")
    step = np.ones(12)
    same(ask(m, "my_fir", step, ask(m, "running_average", 5)),
         signal.lfilter(np.ones(5) / 5, 1, step), "the step response of a 5-point running average")


def lab04_first_difference(m):
    same(ask(m, "first_difference"), [1, -1], "first_difference()")
    same(ask(m, "my_fir", np.ones(8), ask(m, "first_difference")), [1, 0, 0, 0, 0, 0, 0, 0],
         "first difference of a step (should be an impulse)")


# ---- Lab 5: convolution and LTI systems --------------------------------------------

def lti_system(x):
    return np.convolve(x, [0.5, 1.0, -0.25])[: len(x)]


def squarer(x):
    return x ** 2


def plus_one(x):
    return x + 1


def ramp_gain(x):
    return np.arange(len(x)) * x


TEST_SYSTEMS = [  # (system, is it linear?, is it time-invariant?)
    (lti_system, True, True),
    (squarer, False, True),
    (plus_one, False, True),
    (ramp_gain, True, False),
]


def lab05_my_conv(m):
    r = rng(6)
    for nx, nh in [(10, 3), (7, 7), (1, 4), (30, 11)]:
        x, h = r.normal(size=nx), r.normal(size=nh)
        same(ask(m, "my_conv", x, h), np.convolve(x, h), f"my_conv with lengths {nx} and {nh}")
    by_hand(m, "my_conv", DO_IT_YOURSELF)


def lab05_cascade(m):
    r = rng(7)
    h1, h2, x = r.normal(size=4), r.normal(size=3), r.normal(size=20)
    h = ask(m, "cascade", h1, h2)
    same(h, np.convolve(h1, h2), "cascade(h1, h2)")
    same(np.convolve(x, h), np.convolve(np.convolve(x, h1), h2),
         "filtering by cascade(h1, h2) vs h1 then h2")


def lab05_delay(m):
    same(ask(m, "delay", np.array([1.0, 2, 3, 4, 5]), 2), [0, 0, 1, 2, 3], "delay([1,2,3,4,5], 2)")


def lab05_is_linear(m):
    for system, linear, _ in TEST_SYSTEMS:
        same_value(bool(ask(m, "is_linear", system)), linear, f"is_linear({system.__name__})")


def lab05_is_time_invariant(m):
    for system, _, invariant in TEST_SYSTEMS:
        same_value(bool(ask(m, "is_time_invariant", system)), invariant, f"is_time_invariant({system.__name__})")


# ---- Lab 6: frequency response of FIR filters --------------------------------------

def lab06_freq_response(m):
    w = np.linspace(-np.pi, np.pi, 101)
    for b in ([1, 1, 1], [1, -2, 3, 0.5], [0.2] * 5):
        same(ask(m, "freq_response", np.array(b, dtype=float), w), signal.freqz(b, worN=w)[1],
             f"freq_response({b}, w) vs scipy.signal.freqz")
    by_hand(m, "freq_response", NO_FFT)


def lab06_nulling_filter(m):
    for w0 in (0.3, np.pi / 2, 2.5):
        b = ask(m, "nulling_filter", w0)
        same(b, [1, -2 * np.cos(w0), 1], f"nulling_filter({w0:.3f})")
        H = signal.freqz(b, worN=[w0])[1]
        same(abs(H), [0], f"|H| at w0 = {w0:.3f}")


def lab06_steady_state(m):
    b = np.array([1.0, 0.5, -0.3, 0.2])
    A, w0, phi = 2.0, 0.7, 0.4
    n = np.arange(40)
    got = np.asarray(ask(m, "steady_state_output", b, A, w0, phi, n))
    H = signal.freqz(b, worN=[w0])[1][0]
    same(got, abs(H) * A * np.cos(w0 * n + phi + np.angle(H)), "steady_state_output")
    y = signal.lfilter(b, 1, A * np.cos(w0 * n + phi))
    same(got[len(b) - 1:], y[len(b) - 1:], "your prediction vs actually filtering (after the start-up)")


def lab06_bandpass(m):
    n = np.arange(21)
    same(ask(m, "bandpass_filter", 21, 0.8), 2 / 21 * np.cos(0.8 * n), "bandpass_filter(21, 0.8)")


# ---- Lab 7: averaging and nulling filters on sampled signals -----------------------

def lab07_averager(m):
    same(ask(m, "averager", 6), np.ones(6) / 6, "averager(6)")


def lab07_dirichlet(m):
    w = np.linspace(0.05, np.pi, 80)  # w = 0 left out: there the formula is 0/0 (the answer is 1)
    for L in (3, 8):
        same(ask(m, "dirichlet", w, L), signal.freqz(np.ones(L) / L, worN=w)[1],
             f"dirichlet(w, {L}) vs freqz of an {L}-point averager")


def lab07_remove_tones(m):
    fs, N, skip = 8000, 8000, 800  # measure after the filter has started up
    n = np.arange(N)
    tones, keep = [440, 1000], 2500
    x = sum(np.cos(2 * np.pi * f * n / fs) for f in tones + [keep])
    y = np.asarray(ask(m, "remove_tones", x, fs, tones))
    if len(y) != len(x):
        raise Wrong(f"remove_tones returned {len(y)} samples; it should return {len(x)} (same as x)")

    def level(sig, f):  # size of the FFT line at f Hz (bins are 10/9 Hz apart here)
        seg = sig[skip:]
        return abs(np.fft.fft(seg)[round(f * len(seg) / fs)])

    for f in tones:
        if level(y, f) > 0.01 * level(x, f):
            raise Wrong(f"the {f} Hz tone only dropped by {20 * np.log10(level(x, f) / max(level(y, f), 1e-300)):.0f} dB "
                        f"(needs 40 dB or more)")
    if level(y, keep) < 0.1 * level(x, keep):
        raise Wrong(f"the {keep} Hz tone (which should stay) was removed too")


# ---- Lab 8: the DTFT ---------------------------------------------------------------

def ref_dtft(x, w, n_start=0):
    n = np.arange(len(x)) + n_start
    return np.array([np.sum(x * np.exp(-1j * wi * n)) for wi in np.atleast_1d(w)])


def lab08_dtft(m):
    r = rng(8)
    x, w = r.normal(size=9), np.linspace(-np.pi, np.pi, 61)
    same(ask(m, "dtft", x, w, 0), signal.freqz(x, worN=w)[1], "dtft(x, w) vs scipy.signal.freqz")
    same(ask(m, "dtft", x, w, -3), ref_dtft(x, w, -3), "dtft(x, w, n_start=-3)")
    by_hand(m, "dtft", NO_FFT)


def lab08_boxcar(m):
    w = np.linspace(0.05, np.pi, 70)
    for L in (4, 9):
        same(ask(m, "boxcar_dtft", L, w), ref_dtft(np.ones(L), w), f"boxcar_dtft({L}, w) vs the DTFT sum")


def lab08_shift(m):
    r = rng(9)
    x, w = r.normal(size=6), np.linspace(-np.pi, np.pi, 41)
    same(ask(m, "delayed_dtft", ref_dtft(x, w), w, 4), ref_dtft(x, w, 4), "delayed_dtft(X, w, 4)")


def lab08_modulate(m):
    r = rng(10)
    x, w0, w = r.normal(size=7), 0.9, np.linspace(-np.pi, np.pi, 41)
    xm = ask(m, "modulate", x, w0)
    same(xm, x * np.exp(1j * w0 * np.arange(7)), "modulate(x, 0.9)")
    same(ref_dtft(xm, w), ref_dtft(x, w - w0), "the DTFT of the modulated signal vs X shifted by w0")


def lab08_ideal_lowpass(m):
    n = np.arange(-10, 11)
    same(ask(m, "ideal_lowpass", 0.4 * np.pi, n), 0.4 * np.sinc(0.4 * n), "ideal_lowpass(0.4 pi, n)")


# ---- Lab 9: discrete-time Fourier series -------------------------------------------

def lab09_coeffs(m):
    r = rng(11)
    for N in (4, 10):
        x = r.normal(size=N)
        same(ask(m, "dtfs_coeffs", x), np.fft.fft(x) / N, f"dtfs_coeffs (N = {N}) vs np.fft.fft(x) / N")
    by_hand(m, "dtfs_coeffs", NO_FFT)


def lab09_synthesize(m):
    r = rng(12)
    a = r.normal(size=8) + 1j * r.normal(size=8)
    same(ask(m, "dtfs_synthesize", a), np.fft.ifft(a) * 8, "dtfs_synthesize(a) vs np.fft.ifft(a) * N")
    by_hand(m, "dtfs_synthesize", NO_FFT)


def lab09_round_trip(m):
    x = rng(13).normal(size=12)
    same(ask(m, "dtfs_synthesize", ask(m, "dtfs_coeffs", x)), x, "synthesize(coeffs(x)) should give x back")


def lab09_power(m):
    x = rng(14).normal(size=10)
    same(ask(m, "average_power", np.fft.fft(x) / 10), np.mean(x ** 2), "average_power (Parseval)")


# ---- Lab 10: the DFT and touch-tone decoding ---------------------------------------

KEYPAD = [["1", "2", "3", "A"], ["4", "5", "6", "B"], ["7", "8", "9", "C"], ["*", "0", "#", "D"]]
ROW_FREQS = [697, 770, 852, 941]
COL_FREQS = [1209, 1336, 1477, 1633]


def ref_tone(key, fs, n_samples):
    row = next(i for i, keys in enumerate(KEYPAD) if key in keys)
    col = KEYPAD[row].index(key)
    n = np.arange(n_samples)
    return np.cos(2 * np.pi * ROW_FREQS[row] * n / fs) + np.cos(2 * np.pi * COL_FREQS[col] * n / fs)


def lab10_my_dft(m):
    r = rng(15)
    for N in (1, 8, 13):
        x = r.normal(size=N) + 1j * r.normal(size=N)
        same(ask(m, "my_dft", x), np.fft.fft(x), f"my_dft (N = {N}) vs np.fft.fft")
    by_hand(m, "my_dft", NO_FFT)


def lab10_zero_pad(m):
    x = np.array([1.0, 2, 3])
    padded = ask(m, "zero_pad", x, 8)
    same(padded, [1, 2, 3, 0, 0, 0, 0, 0], "zero_pad([1,2,3], 8)")
    same(np.fft.fft(padded), ref_dtft(x, 2 * np.pi * np.arange(8) / 8),
         "the 8-point DFT of the padded signal vs the DTFT at w = 2 pi k / 8")


def lab10_dtmf_tone(m):
    for key in "15#D":
        same(ask(m, "dtmf_tone", key, 8000, 400), ref_tone(key, 8000, 400), f"dtmf_tone({key!r}, 8000, 400)")


def lab10_decode(m):
    r = rng(16)
    keys = "".join(r.choice(list("123A456B789C*0#D"), 12))
    for key in keys:
        x = ref_tone(key, 8000, 2000) + 0.3 * r.normal(size=2000)
        same_value(ask(m, "decode_key", x, 8000), key, "decode_key on a noisy tone")


CHECKS = {
    1: [("make_cosine matches A cos(2 pi f t + phi)", lab01_make_cosine),
        ("phasor matches A e^(j phi)", lab01_phasor),
        ("add_phasors gives the amplitude and phase of the sum", lab01_add_phasors),
        ("sum_of_cosines adds the cosines numerically", lab01_sum_of_cosines),
        ("phasor rule: the numeric sum equals one cosine from the phasor sum", lab01_phasor_rule)],
    2: [("synthesize adds the cosines", lab02_synthesize),
        ("two_sided_spectrum has lines at +-f with A/2 e^(+-j phi)", lab02_spectrum),
        ("line_amplitude reads |X[k]|/N from np.fft.fft and gets A/2", lab02_line_amplitude)],
    3: [("sample_cosine matches cos(2 pi f n / fs + phi)", lab03_sample_cosine),
        ("alias_frequency predicts the folded frequency", lab03_alias_frequency),
        ("fft_peak_frequency finds the biggest FFT line", lab03_fft_peak),
        ("your predicted alias matches your FFT peak", lab03_prediction_matches_fft),
        ("sinc_reconstruct matches the sinc interpolation sum", lab03_sinc_reconstruct)],
    4: [("impulse and unit_step", lab04_impulse_step),
        ("my_fir matches np.convolve(x, b)[:len(x)], written by hand", lab04_my_fir_convolve),
        ("my_fir matches scipy.signal.lfilter(b, 1, x)", lab04_my_fir_lfilter),
        ("impulse response of my_fir is b itself", lab04_impulse_response),
        ("running_average and its step response", lab04_running_average),
        ("first_difference turns a step into an impulse", lab04_first_difference)],
    5: [("my_conv matches np.convolve, written by hand", lab05_my_conv),
        ("cascade gives one impulse response for two filters", lab05_cascade),
        ("delay shifts right and fills with zeros", lab05_delay),
        ("is_linear sorts four test systems correctly", lab05_is_linear),
        ("is_time_invariant sorts four test systems correctly", lab05_is_time_invariant)],
    6: [("freq_response matches scipy.signal.freqz, written by hand", lab06_freq_response),
        ("nulling_filter puts a zero of H at w0", lab06_nulling_filter),
        ("steady_state_output predicts the filter's output", lab06_steady_state),
        ("bandpass_filter makes (2/L) cos(wc n)", lab06_bandpass)],
    7: [("averager", lab07_averager),
        ("dirichlet formula matches freqz of the averager", lab07_dirichlet),
        ("remove_tones drops each tone by 40 dB or more and keeps the rest", lab07_remove_tones)],
    8: [("dtft matches freqz, written by hand", lab08_dtft),
        ("boxcar_dtft closed form matches the DTFT sum", lab08_boxcar),
        ("delayed_dtft: delay by d multiplies by e^(-j w d)", lab08_shift),
        ("modulate: multiplying by e^(j w0 n) shifts the DTFT", lab08_modulate),
        ("ideal_lowpass impulse response", lab08_ideal_lowpass)],
    9: [("dtfs_coeffs matches np.fft.fft(x) / N, written by hand", lab09_coeffs),
        ("dtfs_synthesize matches np.fft.ifft(a) * N, written by hand", lab09_synthesize),
        ("coefficients then synthesis gives the signal back", lab09_round_trip),
        ("average_power: Parseval's relation", lab09_power)],
    10: [("my_dft matches np.fft.fft, written by hand", lab10_my_dft),
         ("zero_pad, and the padded DFT samples the DTFT", lab10_zero_pad),
         ("dtmf_tone adds the row and column cosines", lab10_dtmf_tone),
         ("decode_key reads 12 noisy touch-tones correctly", lab10_decode)],
}
