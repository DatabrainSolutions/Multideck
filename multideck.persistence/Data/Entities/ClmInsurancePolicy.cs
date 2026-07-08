using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmInsurancePolicy
{
    public Guid ClmpolicyId { get; set; }

    public string ClmpolicyNumber { get; set; } = null!;

    public string ClmpolicyName { get; set; } = null!;

    public string ClmpolicyTypeCode { get; set; } = null!;

    public string ClmpolicyStatusCode { get; set; } = null!;

    public Guid? ClmpolicyLegalEntityId { get; set; }

    public Guid? ClmpolicyOrgOfficeId { get; set; }

    public Guid? ClmpolicyBrandId { get; set; }

    public Guid? ClmpolicyInsuredOrgId { get; set; }

    public Guid? ClmpolicyInsurerOrgId { get; set; }

    public Guid? ClmpolicyBrokerOrgId { get; set; }

    public Guid? ClmpolicyPrimaryContactId { get; set; }

    public string ClmpolicyCurrencyCodeSnapshot { get; set; } = null!;

    public decimal ClmpolicyAnnualPremiumAmount { get; set; }

    public decimal ClmpolicyPerClaimLimitAmount { get; set; }

    public decimal ClmpolicyAggregateLimitAmount { get; set; }

    public decimal ClmpolicyDeductibleAmount { get; set; }

    public decimal ClmpolicyMinimumClaimAmount { get; set; }

    public DateOnly ClmpolicyInceptionDate { get; set; }

    public DateOnly ClmpolicyExpiryDate { get; set; }

    public DateOnly? ClmpolicyRenewalNoticeDate { get; set; }

    public string? ClmpolicyTerritoryCode { get; set; }

    public string ClmpolicyCoveredModeCodesJson { get; set; } = null!;

    public string ClmpolicyCoveredServiceCodesJson { get; set; } = null!;

    public string ClmpolicyCommodityRulesJson { get; set; } = null!;

    public string ClmpolicyExclusionsJson { get; set; } = null!;

    public string ClmpolicyNotificationRulesJson { get; set; } = null!;

    public bool ClmpolicyIsDefault { get; set; }

    public string? ClmpolicyNotes { get; set; }

    public string ClmpolicyMetadataJson { get; set; } = null!;

    public DateTime ClmpolicyCreatedAt { get; set; }

    public Guid? ClmpolicyCreatedBy { get; set; }

    public DateTime ClmpolicyUpdatedAt { get; set; }

    public Guid? ClmpolicyUpdatedBy { get; set; }

    public virtual ICollection<ClmAiinsight> ClmAiinsights { get; set; } = new List<ClmAiinsight>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<ClmPolicyCoverage> ClmPolicyCoverages { get; set; } = new List<ClmPolicyCoverage>();

    public virtual ICollection<ClmPolicyDocument> ClmPolicyDocuments { get; set; } = new List<ClmPolicyDocument>();

    public virtual ICollection<ClmPolicyParty> ClmPolicyParties { get; set; } = new List<ClmPolicyParty>();

    public virtual ICollection<ClmPolicyRenewal> ClmPolicyRenewals { get; set; } = new List<ClmPolicyRenewal>();

    public virtual CmpBrand? ClmpolicyBrand { get; set; }

    public virtual OrgMaster? ClmpolicyBrokerOrg { get; set; }

    public virtual CmpUser? ClmpolicyCreatedByNavigation { get; set; }

    public virtual OrgMaster? ClmpolicyInsuredOrg { get; set; }

    public virtual OrgMaster? ClmpolicyInsurerOrg { get; set; }

    public virtual CmpLegalEntity? ClmpolicyLegalEntity { get; set; }

    public virtual CmpOffice? ClmpolicyOrgOffice { get; set; }

    public virtual OrgContact? ClmpolicyPrimaryContact { get; set; }

    public virtual SysClmpolicyStatus ClmpolicyStatusCodeNavigation { get; set; } = null!;

    public virtual SysClmpolicyType ClmpolicyTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? ClmpolicyUpdatedByNavigation { get; set; }
}
