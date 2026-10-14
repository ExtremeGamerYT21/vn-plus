# MP3 encoder

`lame.all.js` is the unmodified JavaScript encoder from [lamejs 1.2.1](https://github.com/zhuker/lamejs), published on npm under LGPL-3.0. Its original license notice is in `lamejs-LICENSE.txt`. The complete upstream source package is available from [the npm source archive](https://registry.npmjs.org/lamejs/-/lamejs-1.2.1.tgz). LAME's project is [lame.sourceforge.net](https://lame.sourceforge.net/).

The package archive was verified against npm's published SHA-512 integrity before vendoring. VN+ loads this separate library in an export worker to produce actual MP3 dialogue clips. The encoder is kept separate from VN+ implementation code and is not modified.
