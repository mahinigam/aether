exports.up = (pgm) => {
    pgm.sql(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
            ) THEN
                ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
            END IF;
        END $$;
    `);
};

exports.down = (pgm) => {
    pgm.dropConstraint('users', 'users_username_key');
};
