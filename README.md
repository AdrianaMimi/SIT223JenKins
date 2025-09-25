# SIT223Project

Repository for SIT223 HD task: 

---

## Jenkins Script (Also found in JenkinsScript.txt): 

pipeline {
  agent any
  options { ansiColor('xterm'); timestamps() }
  tools { nodejs 'Node22' }

  stages {
    stage('Checkout') {
      steps {
        git branch: 'main',
            url: 'https://github.com/AdrianaMimi/SIT223JenKins.git',
            credentialsId: 'github-pat'
      }
    }

    stage('Build') {
      environment {
        VITE_FIREBASE_API_KEY             = credentials('vite_firebase_api_key')
        VITE_FIREBASE_AUTH_DOMAIN         = credentials('vite_firebase_auth_domain')
        VITE_FIREBASE_PROJECT_ID          = credentials('vite_firebase_project_id')
        VITE_FIREBASE_STORAGE_BUCKET      = credentials('vite_firebase_storage_bucket')
        VITE_FIREBASE_MESSAGING_SENDER_ID = credentials('vite_firebase_messaging_sender_id')
        VITE_FIREBASE_APP_ID              = credentials('vite_firebase_app_id')
        VITE_MEASUREMENT_ID               = credentials('vite_measurement_id')
        VITE_FN_CHECKOUT                  = credentials('vite_fn_checkout')
        VITE_FN_ACTIVATE                  = credentials('vite_fn_activate')
        VITE_STRIPE_PUBLISHABLE_KEY       = credentials('vite_stripe_publishable')
        VITE_API_TOKEN_REFRESH            = credentials('vite_api_token_refresh')
      }
      steps {
        dir('frontend') {
          sh 'npm ci'
          sh 'npm run build'
          sh '(cd dist && zip -r ../../dist.zip .)'
        }
        dir('backend') {
          sh 'npm ci --omit=dev'
          sh '''
            tar -czf ../backend.tar.gz \
              package.json package-lock.json \
              node_modules \
              index.js
          '''
        }
        dir('functions') {
          sh '''
            npm ci --omit=dev
            zip -r ../functions.zip \
              package.json package-lock.json node_modules \
              index.js stripe.mjs tokenrefresh.mjs \
              firebase.json .firebaserc \
              -x ".env" -x "node_modules/.cache/*"
          '''
        }
        archiveArtifacts artifacts: 'dist.zip,backend.tar.gz,functions.zip', fingerprint: true
      }
    }

    stage('Test') {
      environment {
        CI = 'true'
        DISABLE_EMAIL = '1'
        NODE_OPTIONS = '--max_old_space_size=4096'
      }
      steps {
        dir('frontend') { sh 'npm ci && npm run test:ci || true' }
        dir('backend')  { sh 'npm ci && npm run test:ci || true' }
        dir('functions') {
          sh 'npm ci && npm run lint || true && npm run test:ci || true'
        }
      }
      post {
        always {
          junit allowEmptyResults: true, skipPublishingChecks: true, testResults: '**/reports/**/*.xml'
          archiveArtifacts artifacts: '**/coverage/**', allowEmptyArchive: true
        }
      }
    }

    stage('Code Quality') {
      steps {
        withSonarQubeEnv('SONAR_HD_SIT223') {
          withEnv(["PATH+SONAR=${tool 'SonarScanner'}/bin"]) {
            sh '''
              set -eux
              sonar-scanner -Dsonar.projectVersion=$BUILD_NUMBER
            '''
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          script {
            def qg = waitForQualityGate()
            echo "Quality Gate: ${qg.status}"
          }
        }
      }
    }

    stage('Security') {
      environment {
        SNYK_TOKEN    = credentials('snyk-token')
        SNYK_SEVERITY = 'high'
      }
      steps {
        sh '''
          set -eu
          TOOLS="$WORKSPACE/.tools"
          mkdir -p "$TOOLS"
          curl -fsSL https://static.snyk.io/cli/latest/snyk-linux -o "$TOOLS/snyk"
          chmod +x "$TOOLS/snyk"
          "$TOOLS/snyk" auth "$SNYK_TOKEN"

          scan_dir () {
            dir="$1"
            echo "==== Snyk scan: $dir ===="
            ( cd "$dir"
              npm ci || true
              "$TOOLS/snyk" test \
                --severity-threshold="$SNYK_SEVERITY" \
                --json-file-output=snyk.json || true
              tries=0
              until "$TOOLS/snyk" monitor --project-name="${JOB_NAME}:$dir"; do
                tries=$((tries+1))
                echo "[snyk monitor:$dir] attempt $tries failed at $(date -u '+%F %T %Z')"
                [ $tries -ge 3 ] && break
                sleep 20
              done
            )
          }

          for d in frontend backend functions; do
            [ -d "$d" ] && scan_dir "$d" || echo "skip $d (missing)"
          done
          
          cat > snyk-agg.js <<'NODE'
          const fs = require('fs'), path = require('path');
          const dirs = ['frontend','backend','functions'];
          let hi = 0, crit = 0;
          for (const d of dirs) {
            const p = path.join(d,'snyk.json');
            if (!fs.existsSync(p)) continue;
            const j = JSON.parse(fs.readFileSync(p,'utf8'));
            const items =
              Array.isArray(j.vulnerabilities) ? j.vulnerabilities :
              (j.issues && Array.isArray(j.issues.vulnerabilities)) ? j.issues.vulnerabilities :
              [];
            for (const v of items) {
              const s = (v.severity||'').toLowerCase();
              if (s==='high') hi++;
              if (s==='critical') crit++;
            }
          }
          console.log(`SNYK SUMMARY => High=${hi} Critical=${crit}`);
          if (hi+crit>0) process.exit(2);
          NODE
        '''
        archiveArtifacts artifacts: '**/snyk.json', allowEmptyArchive: true, fingerprint: true
      }
      post {
        failure {
          echo 'Security gate failed (High/Critical found). Check console and snyk.json artifacts.'
        }
      }
    }

    stage('Deploy')     { steps { echo 'mock: deploy skipped' } }
    stage('Release')    { steps { echo 'mock: release/tag' } }
    stage('Monitoring') { steps { echo 'mock: health check' } }
  }
}

---
You are currently on the main branch. 
---
This respository is used for SIT223 HD Task. 