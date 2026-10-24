import type { Guide, GuideContext } from '../guide';

export const twilioGuide = (_ctx: GuideContext): Guide => ({
  id: 'twilio',
  intro: 'Texting runs on Twilio, with one subaccount and one local number per client, registered in the client\'s own name. For now the setup in Twilio is done by hand and the dashboard keeps track of it. Automating it is a later build.',
  time: 'About 30 minutes of clicking per client, plus the carriers\' review time.',
  cost: 'Twilio charges for the number and each text, plus one-time registration fees. At the time of writing a standard brand is about $44 and a sole-proprietor or low-volume brand about $4, plus about $15 per campaign and a small monthly fee. Check Twilio\'s pricing for current amounts.',
  steps: [
    {
      title: 'Get the business details first',
      body: [
        'On the client\'s Setup tab, open the registration step, choose "Open our business registration form", and email them the link. They fill in one secure form, including their EIN.',
        'When it arrives, review it on the client\'s Twilio tab and mark it Ready to file.',
      ],
      note: 'A business that has an EIN must be registered as a standard business. Twilio rejects a business with an EIN that registers as a sole proprietor. The form decides the right path for you.',
    },
    { title: 'Create a subaccount for this client in Twilio', body: ['In the Twilio console open Subaccounts and create one named after the client. Copy its SID (it starts with AC) and its auth token.'] },
    { title: 'Buy a local number', body: ['Inside that subaccount buy a local number in the client\'s area code. Copy the number and its SID (it starts with PN).'] },
    { title: 'Create a Messaging Service', body: ['Create a Messaging Service in the subaccount and add the number to it. Copy its SID (it starts with MG).'] },
    {
      title: 'Register the business and the campaign',
      body: [
        'Register the brand using the details from the registration form, then register the campaign. The brand is often approved within a couple of business days. The campaign takes longer, commonly a few weeks.',
        'Opt-in wording is the most common reason a campaign is rejected, so keep it clear: the first text says who we are and ends with Reply STOP to opt out.',
      ],
    },
    { title: 'Record it in the dashboard', body: ['On the client\'s Twilio tab paste the SIDs and the number, save the auth token (it is encrypted and never shown again), and set the registration status as it changes.'] },
  ],
  checks: [
    'The Twilio tab\'s "Where this client stands" list shows Done for the subaccount, the token, the approval and forwarding.',
    'Only then can the Engine tab\'s Turn on button be pressed for that client.',
  ],
});
