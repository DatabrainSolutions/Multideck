using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommProviderType
{
    public string CommProviderTypeCode { get; set; } = null!;

    public string CommProviderTypeName { get; set; } = null!;

    public string? CommProviderTypeDescription { get; set; }

    public int CommProviderTypeSortOrder { get; set; }

    public bool CommProviderTypeIsActive { get; set; }

    public DateTime CommProviderTypeCreatedAt { get; set; }

    public virtual ICollection<CommProviderConnection> CommProviderConnections { get; set; } = new List<CommProviderConnection>();
}
