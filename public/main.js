let influencerData = {};
let channelID;
function setup(){ //p5js built in function that runs automatically
    influencerData = loadJSON('influencers.json');
}

document.addEventListener('DOMContentLoaded',function(){
    const submitVideoButton = document.getElementById('submitVideoButton');
    const linkInput = document.getElementById('linkInput');
    const creatorInput = document.getElementById('creatorInput');
    const videoNameInput = document.getElementById('videoNameInput');
    const automizeButton = document.getElementById('linkAutomizeButton'); //located inside video link input
    const creatorButton = document.getElementById('creatorButton'); //located inside creator input

    linkInput.addEventListener('input', automizeButtonToggle); //automize button appear toggle
    automizeButton.addEventListener('click', get_ytdl_info); //autofill(from ytdl-info)
    creatorInput.addEventListener('input', creatorButtonToggle);//creator button appear toggle
    creatorButton.addEventListener('click',addInfluencer);
    submitVideoButton.addEventListener('click',gotoClipper);

    function automizeButtonToggle(){
        if(linkInput.value.trim() !== ''){
            automizeButton.style.display = 'block';
        } else{
            automizeButton.style.display = 'none';
        }
    }

    function get_ytdl_info() {
        event.preventDefault();

        const link = linkInput.value; //video link
        const loadingSpinner = document.getElementById('loading-spinner');
        loadingSpinner.style.display = 'block';

        fetch(`/influencers/videos?videoUrl=${encodeURIComponent(link)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('서버 응답 오류');
                }
                return response.json();
            })
            .then(data => {
                creatorInput.value = data.name
                videoNameInput.value = data.title;
                channelID = data.id;
                creatorButtonToggle(data.exist);
                loadingSpinner.style.display = 'none';
            })
            .catch(err => {
                console.error(err);
                loadingSpinner.style.display = 'none';
            });
    }


    function creatorButtonToggle(exist){
        if(creatorInput.value.trim() !== ''){
            if(exist){
                creatorButton.textContent = "✔";
            } else{
                creatorButton.textContent = "+";
            }
            creatorButton.style.display = 'block';
        } else{
            creatorButton.style.display = 'none';
        }
    }

    function addInfluencer(){ // relocate to add_creator/add_creator.html
        event.preventDefault();
        window.location.href = `add_creator/add_creator.html?influencer_id=${encodeURIComponent(channelID)}`;
    }

    function gotoClipper(){
        event.preventDefault();

        const link = linkInput.value;
        const influencer = creatorInput.value;
        const videoName = videoNameInput.value;

        if(creatorButton.textContent === "✔"){
            window.location.href=  `video_trimmer/video.html?channelID=${channelID}&videoUrl=${encodeURIComponent(link)}&influencer=${encodeURIComponent(influencer)}&videoName=${encodeURIComponent(videoName)}`;
        }
    }
})