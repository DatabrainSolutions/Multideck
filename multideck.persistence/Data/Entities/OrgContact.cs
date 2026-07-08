using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgContact
{
    public Guid OrgContactId { get; set; }

    public Guid OrgId { get; set; }

    public string? OrgContactFirstName { get; set; }

    public string? OrgContactLastName { get; set; }

    public virtual ICollection<ClmClaimParty> ClmClaimParties { get; set; } = new List<ClmClaimParty>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveries { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<ClmIncidentParty> ClmIncidentParties { get; set; } = new List<ClmIncidentParty>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicies { get; set; } = new List<ClmInsurancePolicy>();

    public virtual ICollection<ClmPolicyParty> ClmPolicyParties { get; set; } = new List<ClmPolicyParty>();

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();

    public virtual ICollection<CommConsentPreference> CommConsentPreferences { get; set; } = new List<CommConsentPreference>();

    public virtual ICollection<CommFederationPeer> CommFederationPeers { get; set; } = new List<CommFederationPeer>();

    public virtual ICollection<CommIdentity> CommIdentities { get; set; } = new List<CommIdentity>();

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();

    public virtual ICollection<CommThreadParticipant> CommThreadParticipants { get; set; } = new List<CommThreadParticipant>();

    public virtual ICollection<CrmActivityParticipant> CrmActivityParticipants { get; set; } = new List<CrmActivityParticipant>();

    public virtual ICollection<CrmCampaignMember> CrmCampaignMembers { get; set; } = new List<CrmCampaignMember>();

    public virtual CrmContactProfile? CrmContactProfile { get; set; }

    public virtual ICollection<CrmCustomerEngagementPreference> CrmCustomerEngagementPreferences { get; set; } = new List<CrmCustomerEngagementPreference>();

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmDuplicateCandidate> CrmDuplicateCandidates { get; set; } = new List<CrmDuplicateCandidate>();

    public virtual ICollection<CrmLead> CrmLeads { get; set; } = new List<CrmLead>();

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmOpportunityStakeholder> CrmOpportunityStakeholders { get; set; } = new List<CrmOpportunityStakeholder>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowups { get; set; } = new List<CrmQuoteFollowup>();

    public virtual ICollection<CrmRelationshipMap> CrmRelationshipMapCrmrelMapFromContacts { get; set; } = new List<CrmRelationshipMap>();

    public virtual ICollection<CrmRelationshipMap> CrmRelationshipMapCrmrelMapToContacts { get; set; } = new List<CrmRelationshipMap>();

    public virtual ICollection<MdxSharedParty> MdxSharedParties { get; set; } = new List<MdxSharedParty>();

    public virtual OrgMaster Org { get; set; } = null!;

    public virtual ICollection<OrgContactEmail> OrgContactEmails { get; set; } = new List<OrgContactEmail>();

    public virtual ICollection<PortalInvitation> PortalInvitations { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalUserOrganisation> PortalUserOrganisations { get; set; } = new List<PortalUserOrganisation>();

    public virtual ICollection<PortalUser> PortalUsers { get; set; } = new List<PortalUser>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();
}
