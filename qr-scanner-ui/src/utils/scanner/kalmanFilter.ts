export interface KalmanBBoxMeasurement {
  centerX: number
  centerY: number
  width: number
  height: number
}

interface KalmanScalarOptions {
  processNoise?: number
  measurementNoise?: number
}

const DEFAULT_PROCESS_NOISE = 2
const DEFAULT_MEASUREMENT_NOISE = 22

class KalmanScalarFilter {
  private estimate: number | null = null

  private errorCovariance = 1

  private readonly processNoise: number

  private readonly measurementNoise: number

  constructor(options: KalmanScalarOptions = {}) {
    this.processNoise = options.processNoise ?? DEFAULT_PROCESS_NOISE
    this.measurementNoise = options.measurementNoise ?? DEFAULT_MEASUREMENT_NOISE
  }

  reset(): void {
    this.estimate = null
    this.errorCovariance = 1
  }

  update(measurement: number): number {
    if (this.estimate === null) {
      this.estimate = measurement
      this.errorCovariance = this.measurementNoise
      return measurement
    }

    this.errorCovariance += this.processNoise
    const kalmanGain =
      this.errorCovariance / (this.errorCovariance + this.measurementNoise)
    this.estimate += kalmanGain * (measurement - this.estimate)
    this.errorCovariance *= 1 - kalmanGain

    return this.estimate
  }
}

export class KalmanBBoxFilter {
  private readonly centerXFilter = new KalmanScalarFilter()

  private readonly centerYFilter = new KalmanScalarFilter()

  private readonly widthFilter = new KalmanScalarFilter()

  private readonly heightFilter = new KalmanScalarFilter()

  reset(): void {
    this.centerXFilter.reset()
    this.centerYFilter.reset()
    this.widthFilter.reset()
    this.heightFilter.reset()
  }

  update(measurement: KalmanBBoxMeasurement): KalmanBBoxMeasurement {
    return {
      centerX: this.centerXFilter.update(measurement.centerX),
      centerY: this.centerYFilter.update(measurement.centerY),
      width: this.widthFilter.update(measurement.width),
      height: this.heightFilter.update(measurement.height),
    }
  }
}
