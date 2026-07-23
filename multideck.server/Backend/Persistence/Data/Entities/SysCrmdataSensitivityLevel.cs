using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmdataSensitivityLevel
{
    public string CrmdataSensitivityCode { get; set; } = null!;

    public string CrmdataSensitivityName { get; set; } = null!;

    public string? CrmdataSensitivityDescription { get; set; }

    public bool CrmdataSensitivityRequiresExplicitApproval { get; set; }

    public bool CrmdataSensitivityIsActive { get; set; }

    public int CrmdataSensitivitySortOrder { get; set; }

    public virtual ICollection<CrmAutomationFieldDefinition> CrmAutomationFieldDefinitions { get; set; } = new List<CrmAutomationFieldDefinition>();
}
