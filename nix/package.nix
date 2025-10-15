{ lib, stdenv, nodejs, npm, age, zstd }:

stdenv.mkDerivation rec {
  pname = "johnny-blog-datagraph";
  version = "1.0.0";

  src = ./.;

  nativeBuildInputs = [ nodejs npm age zstd ];

  buildPhase = ''
    # Install dependencies
    npm ci --production
    
    # Build TypeScript if needed
    if [ -f tsconfig.json ]; then
      npm run build
    fi
  '';

  installPhase = ''
    # Create directories
    mkdir -p $out/bin
    mkdir -p $out/lib
    mkdir -p $out/share
    
    # Copy application files
    cp -r api/ $out/lib/
    cp -r scripts/ $out/lib/
    cp -r data/ $out/lib/
    cp -r metadata/ $out/lib/
    cp package.json $out/lib/
    cp package-lock.json $out/lib/
    
    # Create executable script
    cat > $out/bin/johnny-blog-dg << EOF
#!/bin/sh
export NODE_PATH=$out/lib/node_modules
export PATH=$out/lib/node_modules/.bin:\$PATH
cd $out/lib
exec ${nodejs}/bin/node api/server.js "\$@"
EOF
    
    chmod +x $out/bin/johnny-blog-dg
    
    # Create systemd service script
    cat > $out/bin/johnny-blog-dg-service << EOF
#!/bin/sh
export AGE_PRIVATE_KEY="\${AGE_PRIVATE_KEY}"
export AGE_PUBLIC_KEY="\${AGE_PUBLIC_KEY}"
export DATAGRAPH_PORT="\${DATAGRAPH_PORT:-3007}"
export FRONTEND_URL="\${FRONTEND_URL:-http://localhost:3000}"
exec $out/bin/johnny-blog-dg
EOF
    
    chmod +x $out/bin/johnny-blog-dg-service
    
    # Create backup script (placeholder)
    cat > $out/bin/johnny-blog-dg-backup << EOF
#!/bin/sh
echo "Backup service placeholder - no backup needed for encrypted data"
exit 0
EOF
    
    chmod +x $out/bin/johnny-blog-dg-backup
  '';

  meta = with lib; {
    description = "The first production encrypted datagraph on Xnode infrastructure";
    homepage = "https://github.com/johnforfar/johnny-blog-dg";
    license = licenses.mit;
    maintainers = [ ];
    platforms = platforms.linux;
  };
}


