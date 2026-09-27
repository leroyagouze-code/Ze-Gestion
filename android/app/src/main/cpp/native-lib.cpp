// Lance Node.js (nodejs-mobile) dans le processus de l'appli et renvoie sa sortie dans logcat.
#include <android/log.h>
#include <jni.h>
#include <pthread.h>
#include <unistd.h>

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "node.h"

static const char *TAG = "ZEGestionNode";
static int pipeOut[2], pipeErr[2];

static void *forward(void *arg) {
  int fd = *static_cast<int *>(arg);
  int prio = fd == pipeErr[0] ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO;
  char buf[2048];
  ssize_t n;
  while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
    if (buf[n - 1] == '\n') --n;
    buf[n] = 0;
    __android_log_write(prio, TAG, buf);
  }
  return nullptr;
}

static void redirectOutput() {
  setvbuf(stdout, nullptr, _IOLBF, 0);
  setvbuf(stderr, nullptr, _IONBF, 0);
  pipe(pipeOut);
  pipe(pipeErr);
  dup2(pipeOut[1], STDOUT_FILENO);
  dup2(pipeErr[1], STDERR_FILENO);
  pthread_t t1, t2;
  pthread_create(&t1, nullptr, forward, &pipeOut[0]);
  pthread_create(&t2, nullptr, forward, &pipeErr[0]);
  pthread_detach(t1);
  pthread_detach(t2);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_zegroup_gestion_NodeRunner_startNode(JNIEnv *env, jclass, jobjectArray arguments) {
  jsize argc = env->GetArrayLength(arguments);
  // node::Start attend des arguments contigus en mémoire (libuv réécrit argv)
  std::vector<std::string> parts;
  size_t total = 0;
  for (jsize i = 0; i < argc; i++) {
    auto js = (jstring)env->GetObjectArrayElement(arguments, i);
    const char *s = env->GetStringUTFChars(js, nullptr);
    parts.emplace_back(s);
    total += strlen(s) + 1;
    env->ReleaseStringUTFChars(js, s);
    env->DeleteLocalRef(js);
  }
  char *buffer = static_cast<char *>(calloc(total, 1));
  std::vector<char *> argv(argc);
  char *cur = buffer;
  for (jsize i = 0; i < argc; i++) {
    memcpy(cur, parts[i].c_str(), parts[i].size() + 1);
    argv[i] = cur;
    cur += parts[i].size() + 1;
  }
  redirectOutput();
  return node::Start(argc, argv.data());
}
