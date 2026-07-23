using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedUsualHandling
{
    public Guid WmsbondHandlingId { get; set; }

    public Guid WmsbondHandlingAuthorisationId { get; set; }

    public string WmsbondHandlingCode { get; set; } = null!;

    public string WmsbondHandlingName { get; set; } = null!;

    public string? WmsbondHandlingDescription { get; set; }

    public bool WmsbondHandlingRequiresPriorApproval { get; set; }

    public bool WmsbondHandlingIsActive { get; set; }

    public virtual WmsBondedAuthorisation WmsbondHandlingAuthorisation { get; set; } = null!;
}
