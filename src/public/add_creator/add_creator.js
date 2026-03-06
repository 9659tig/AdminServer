document.addEventListener('DOMContentLoaded', function(){
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);

    const channel_name_input = document.getElementById('channel_name_input');
    const channel_description_input = document.getElementById('channel_description_input');
    const channel_link_input = document.getElementById('channel_link_input');
    const channel_ID_input = document.getElementById('channel_ID_input');

    const saveButton = document.getElementById('saveButton');

    if(urlParams.get("influencer_id")){
        fetch('/channel/'+urlParams.get("influencer_id"))
            .then(response => response.json())
            .then(data => {
                channel_name_input.value = data.snippet.title;
                channel_description_input.value = data.brandingSettings.channel.description;
                channel_link_input.value = "https://www.youtube.com/channel/"+data.id;
                channel_ID_input.value = data.id;

                const profile_img = document.createElement('img');
                profile_img.src = data.snippet.thumbnails.high.url;
                document.getElementById('profilePicDiv').appendChild(profile_img);

                const banner_img = document.createElement('img');
                banner_img.src = data.brandingSettings.image.bannerExternalUrl;
                document.getElementById('bannerPicDiv').appendChild(banner_img);
            })
            .catch(err=>{
                console.error(err);
            })
    }
    saveButton.addEventListener('click',saveValues);
})

function saveValues(){
    const channel_name = document.getElementById('channel_name_input').value;
    const channel_description = document.getElementById('channel_description_input').value;
    const channel_link = document.getElementById('channel_link_input').value;
    const channel_ID = document.getElementById('channel_ID_input').value;
    const pfp_url = document.getElementById('profilePicDiv').children[0].src;
    const banner_url = document.getElementById('bannerPicDiv').children[0].src;
    const email = document.getElementById('email_input').value;
    const linkInputs = document.getElementsByClassName('link_input_div');
    const links = Array.from(linkInputs)
        .map((element) => ({
            type: element.children[0].value,
            link: element.children[1].value.trim(),
        }))
        .filter((item) => item.link);

    const channel_object = {
        channel_name: channel_name,
        channel_description: channel_description,
        channel_link: channel_link,
        channel_ID: channel_ID,
        pfp_url: pfp_url,
        banner_url: banner_url,
        email: email,
        links: links,
        subscriberCount: 475000,
    };

    fetch('/influencer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(channel_object),
    })
        .then(response => {
            if (response.ok) {
                console.log('successfully saved');
            } else {
                console.log('save-influencer response not ok');
            }
        })
        .catch(err => {
            console.error(err);
        });
}
