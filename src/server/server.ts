import {app} from './app';
import {log} from './log';

const port = process.env.PORT || 3000;

app.listen(port, () => log.info(`dhos-pdf-engine listening on port ${port}!`));
