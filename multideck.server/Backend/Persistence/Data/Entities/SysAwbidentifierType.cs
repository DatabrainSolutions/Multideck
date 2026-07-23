using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Identifier and reference types associated with an AWB.
/// </summary>
public partial class SysAwbidentifierType
{
    public string AwbitCode { get; set; } = null!;

    public string AwbitName { get; set; } = null!;

    public string? AwbitDescription { get; set; }

    public int AwbitSortOrder { get; set; }

    public bool AwbitIsActive { get; set; }

    public DateTime AwbitCreatedAt { get; set; }

    public virtual ICollection<AwbIdentifier> AwbIdentifiers { get; set; } = new List<AwbIdentifier>();
}
