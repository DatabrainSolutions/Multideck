using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceScreeningPolicy
{
    public Guid TcepolicyId { get; set; }

    public string TcepolicyCode { get; set; } = null!;

    public string TcepolicyName { get; set; } = null!;

    public Guid? TcepolicyOrgOfficeId { get; set; }

    public Guid? TcepolicyLegalEntityId { get; set; }

    public Guid? TcepolicyBrandId { get; set; }

    public Guid? TcepolicyCustomerOrgId { get; set; }

    public string TcepolicyDefaultRunTypeCode { get; set; } = null!;

    public decimal TcepolicyMinReviewScore { get; set; }

    public decimal TcepolicyMinBlockScore { get; set; }

    public bool TcepolicyApplyCountryControls { get; set; }

    public bool TcepolicyApplyGoodsControls { get; set; }

    public bool TcepolicyApplyOwnershipControls { get; set; }

    public bool TcepolicyAutoHoldStrongMatches { get; set; }

    public int TcepolicyRescreenFrequencyHours { get; set; }

    public string TcepolicySettingsJson { get; set; } = null!;

    public bool TcepolicyIsActive { get; set; }

    public DateTime TcepolicyCreatedAt { get; set; }

    public Guid? TcepolicyCreatedBy { get; set; }

    public DateTime TcepolicyUpdatedAt { get; set; }

    public Guid? TcepolicyUpdatedBy { get; set; }

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();

    public virtual ICollection<TcePolicyScope> TcePolicyScopes { get; set; } = new List<TcePolicyScope>();

    public virtual ICollection<TcePolicySource> TcePolicySources { get; set; } = new List<TcePolicySource>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<TceScreeningTouchpointRule> TceScreeningTouchpointRules { get; set; } = new List<TceScreeningTouchpointRule>();

    public virtual CmpBrand? TcepolicyBrand { get; set; }

    public virtual CmpUser? TcepolicyCreatedByNavigation { get; set; }

    public virtual OrgMaster? TcepolicyCustomerOrg { get; set; }

    public virtual SysTcescreeningRunType TcepolicyDefaultRunTypeCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? TcepolicyLegalEntity { get; set; }

    public virtual CmpOffice? TcepolicyOrgOffice { get; set; }

    public virtual CmpUser? TcepolicyUpdatedByNavigation { get; set; }
}
