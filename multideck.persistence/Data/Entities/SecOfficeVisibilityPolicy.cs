using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecOfficeVisibilityPolicy
{
    public Guid SecofficePolicyId { get; set; }

    public string SecofficePolicyCode { get; set; } = null!;

    public string SecofficePolicyName { get; set; } = null!;

    public Guid? SecofficePolicySourceOrgOfficeId { get; set; }

    public Guid? SecofficePolicyTargetOrgOfficeId { get; set; }

    public string? SecofficePolicyModuleCode { get; set; }

    public bool SecofficePolicyCanView { get; set; }

    public bool SecofficePolicyCanEdit { get; set; }

    public bool SecofficePolicyCanPostFinance { get; set; }

    public bool SecofficePolicyCanIssueDocuments { get; set; }

    public string SecofficePolicyConditionsJson { get; set; } = null!;

    public bool SecofficePolicyIsActive { get; set; }

    public DateTime SecofficePolicyCreatedAt { get; set; }

    public virtual SysSubmoduleCode? SecofficePolicyModuleCodeNavigation { get; set; }

    public virtual CmpOffice? SecofficePolicySourceOrgOffice { get; set; }

    public virtual CmpOffice? SecofficePolicyTargetOrgOffice { get; set; }
}
