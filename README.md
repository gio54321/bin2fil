# Bin2fil converter

This is a simple routine that converts .bin (that is a custom file format that stores samples from devices like AIRSPY or RTL-SDR) into filterbank format (that is a common format for pulsar signal elaboration and hunting used by [presto](https://github.com/scottransom/presto) and [sigproc](http://sigproc.sourceforge.net/)). It implements decimation control and the possibility to apply bessel and butterworth filters.

### Prerequisites

Make sure node.js and npm are installed on your machine and the executables directory is in you PATH environment variable.
This is a cross platform software working with electron so it should work fine on all OS.

### Installing
```
npm install
```
### Executing
```
npm start
```

## Bugs and Issues

Please report every issue you step into running this software in the [issues](https://github.com/gio54321/bin2fil/issues) page.
