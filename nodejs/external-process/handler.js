import { exec } from 'node:child_process';

export const handler = (req, res, callback) => {
    if (!req.cmd) {
        return callback('Please specify a command to run as req.cmd');
    }
    const child = exec(req.cmd, (error) => {
        // Resolve with result of process
        callback(error, 'Process complete!');
    });

    // Log process stdout and stderr
    child.stdout.on('data', console.log);
    child.stderr.on('data', console.error);
};
