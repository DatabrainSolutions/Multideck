using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.CrmPipelines;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/crm/pipeline-settings")]
[Produces("application/json")]
[TypeFilter(typeof(WarehouseExceptionFilter))]
public sealed class CrmPipelinesController(ICrmPipelineService pipelines) : WarehouseControllerBase
{
    /// <summary>Anyone who can see the CRM reads the shared pipeline configuration.</summary>
    [HttpGet]
    [RequirePermission(AppPermissions.Customers.ReadValue)]
    public async Task<ActionResult<CrmPipelineSettingsDto>> Get(CancellationToken cancellationToken)
    {
        var result = await pipelines.GetSettingsAsync(User, cancellationToken);
        return Ok(result);
    }

    /// <summary>Adding a pipeline adds it for the whole company, so it sits behind Settings.Manage.</summary>
    [HttpPost("pipelines")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<ActionResult<CrmPipelineDto>> CreatePipeline([FromBody] SaveCrmPipelineRequest request, CancellationToken cancellationToken)
    {
        var result = await pipelines.CreatePipelineAsync(User, request, cancellationToken);
        return Ok(result);
    }

    /// <summary>Editing a pipeline changes it for the whole company, so it sits behind Settings.Manage.</summary>
    [HttpPut("pipelines/{pipelineId:guid}")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<ActionResult<CrmPipelineDto>> SavePipeline(Guid pipelineId, [FromBody] SaveCrmPipelineRequest request, CancellationToken cancellationToken)
    {
        var result = await pipelines.SavePipelineAsync(User, pipelineId, request, cancellationToken);
        return Ok(result);
    }

    [HttpDelete("pipelines/{pipelineId:guid}")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<IActionResult> DeletePipeline(Guid pipelineId, CancellationToken cancellationToken)
    {
        await pipelines.DeletePipelineAsync(User, pipelineId, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// The saved order every operator sees the pipelines in. Routed above the id-bound verbs by the
    /// guid constraint, so "order" can never be read as a pipeline identifier.
    /// </summary>
    [HttpPut("pipelines/order")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<ActionResult<IReadOnlyList<CrmPipelineDto>>> ReorderPipelines([FromBody] ReorderCrmPipelinesRequest request, CancellationToken cancellationToken)
    {
        var result = await pipelines.ReorderPipelinesAsync(User, request, cancellationToken);
        return Ok(result);
    }

    [HttpPost("fields")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<ActionResult<CrmLeadFieldDto>> CreateLeadField([FromBody] CreateCrmLeadFieldRequest request, CancellationToken cancellationToken)
    {
        var result = await pipelines.CreateLeadFieldAsync(User, request, cancellationToken);
        return Ok(result);
    }

    [HttpPut("fields/{fieldId:guid}")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<ActionResult<CrmLeadFieldDto>> SaveLeadField(Guid fieldId, [FromBody] SaveCrmLeadFieldRequest request, CancellationToken cancellationToken)
    {
        var result = await pipelines.SaveLeadFieldAsync(User, fieldId, request, cancellationToken);
        return Ok(result);
    }

    [HttpDelete("fields/{fieldId:guid}")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<IActionResult> DeleteLeadField(Guid fieldId, CancellationToken cancellationToken)
    {
        await pipelines.DeleteLeadFieldAsync(User, fieldId, cancellationToken);
        return NoContent();
    }

    [HttpPut("fields/order")]
    [RequirePermission(AppPermissions.Settings.ManageValue)]
    public async Task<ActionResult<IReadOnlyList<CrmLeadFieldDto>>> ReorderLeadFields([FromBody] ReorderCrmLeadFieldsRequest request, CancellationToken cancellationToken)
    {
        var result = await pipelines.ReorderLeadFieldsAsync(User, request, cancellationToken);
        return Ok(result);
    }
}
