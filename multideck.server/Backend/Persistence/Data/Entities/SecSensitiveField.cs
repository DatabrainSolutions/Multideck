using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecSensitiveField
{
    public Guid SecsensFieldId { get; set; }

    public string SecsensFieldTableName { get; set; } = null!;

    public string SecsensFieldFieldName { get; set; } = null!;

    public string? SecsensFieldModuleCode { get; set; }

    public string SecsensFieldSecurityClassCode { get; set; } = null!;

    public string? SecsensFieldDescription { get; set; }

    public bool SecsensFieldIsPersonalData { get; set; }

    public bool SecsensFieldIsCredentialData { get; set; }

    public bool SecsensFieldIsFinancialData { get; set; }

    public bool SecsensFieldIsComplianceData { get; set; }

    public bool SecsensFieldIsActive { get; set; }

    public DateTime SecsensFieldCreatedAt { get; set; }

    public virtual ICollection<SecSensitiveFieldRule> SecSensitiveFieldRules { get; set; } = new List<SecSensitiveFieldRule>();

    public virtual SysSubmoduleCode? SecsensFieldModuleCodeNavigation { get; set; }

    public virtual SysSecsecurityClass SecsensFieldSecurityClassCodeNavigation { get; set; } = null!;
}
