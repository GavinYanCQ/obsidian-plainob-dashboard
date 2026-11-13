'use strict';
function preview({show,canShow=()=>true,schedule=setTimeout,clear=clearTimeout}) {
  let timer=null;
  const cancel=()=>{if(timer!==null)clear(timer);timer=null;};
  return {cancel,arm(){cancel();timer=schedule(()=>{timer=null;if(canShow())show();},3000);}};
}
module.exports = {preview};
